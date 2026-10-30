import { computeTotals, lineNet } from '@/features/documents/lines';
import type { CompanySettings } from '@/features/settings/api';
import { formatIban } from '@/lib/iban';
import {
  createPdf,
  drawLetterhead,
  MARGIN,
  PAGE_W,
  pdfDate,
  pdfFileName,
  pdfMoney,
  pdfText,
} from '@/lib/pdf';
import {
  BRAND,
  drawClientBox,
  drawDocumentHeader,
  drawFooter,
  drawLinesTable,
  drawMentions,
  drawMeta,
  drawTotals,
  ensureSpace,
  MUTED,
  offeredSentence,
  offeredValue,
  type DocumentLine,
} from '@/lib/pdf-document';
import type { ClientBilling, CreditNote, InvoiceLine, InvoiceOverview } from './api';

const RED: [number, number, number] = [176, 58, 46];
const isoDate = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00` : value);

export interface InvoicePdfInput {
  invoice: InvoiceOverview;
  lines: InvoiceLine[];
  company: CompanySettings;
  logo: string | null;
  /** Brouillon : facture pro forma sans numéro (coordonnées client actuelles). */
  proforma?: { client: ClientBilling; paymentTermsDays: number; now?: Date };
}

/** Lignes imprimées. Pro forma : quantité de la main d'œuvre sans l'unité « h » (« 6 », pas « 6 h »). */
export function invoiceDocumentLines(lines: InvoiceLine[], proforma: boolean): DocumentLine[] {
  return lines.map((line) => ({
    line_type: line.line_type,
    description: line.description,
    unit_price: line.unit_price,
    quantity: line.quantity,
    discount_percent: line.discount_percent,
    net: lineNet(line),
    ...(proforma ? { plainQuantity: true } : {}),
  }));
}

/** Facture (maquette « PDF devis et facture ») : dates, client, lignes, totaux, geste commercial, mentions. */
export async function buildInvoicePdf({ invoice, lines, company, logo, proforma }: InvoicePdfInput) {
  const kit = await createPdf();
  const { doc } = kit;
  drawDocumentHeader(
    doc,
    company,
    logo,
    proforma ? 'Facture pro forma' : 'Facture',
    proforma ? 'Pro forma' : (invoice.number ?? ''),
  );

  const now = proforma?.now ?? new Date();
  const issuedAt = proforma ? now : isoDate(invoice.issued_at ?? invoice.created_at);
  const dueDate = proforma
    ? new Date(now.getTime() + proforma.paymentTermsDays * 86_400_000)
    : isoDate(invoice.due_date ?? invoice.created_at);
  const vatNumber = invoice.vat_exempt ? invoice.client_vat_number : null;
  const client = proforma
    ? { ...proforma.client, vat_number: vatNumber }
    : {
        name: invoice.client_name ?? '',
        billing_address: invoice.client_address,
        siret: invoice.client_siret,
        vat_number: vatNumber,
      };

  const meta: [string, string][] = [
    [proforma ? 'Établie le' : 'Date d’émission', pdfDate(issuedAt)],
    [
      'Date de la prestation',
      invoice.service_date ? pdfDate(isoDate(invoice.service_date)) : proforma ? pdfDate(now) : '-',
    ],
    ['Échéance', pdfDate(dueDate)],
    [
      'Véhicule',
      `${invoice.vehicle_label ?? '-'}${invoice.mileage ? ` · ${invoice.mileage.toLocaleString('fr-FR')} km` : ''}`,
    ],
  ];
  if (invoice.repair_order_numbers.length) meta.push(['Réf. OR', invoice.repair_order_numbers.join(', ')]);
  const metaEnd = drawMeta(doc, meta);
  const boxEnd = drawClientBox(doc, 'Facturé à', client);

  const documentLines = invoiceDocumentLines(lines, Boolean(proforma));
  let y = drawLinesTable(kit, [{ title: null, lines: documentLines }], Math.max(metaEnd, boxEnd) + 8) + 8;

  // Totaux : figés à l'émission, recalculés pour un brouillon
  const computed = computeTotals(lines);
  const totals = {
    ...(proforma
      ? computed
      : { ...computed, ht: invoice.total_ht, vat: invoice.total_vat, ttc: invoice.total_ttc }),
    offered: offeredValue(documentLines),
  };
  y = ensureSpace(doc, y, 42);
  const totalsEnd = drawTotals(doc, totals, y, company.default_vat_rate);

  // À gauche des totaux : conditions de paiement et geste commercial
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...MUTED);
  doc.text(`Paiement à ${company.payment_terms_days} jours, avant le ${pdfDate(dueDate)}.`, MARGIN, y + 4, {
    maxWidth: 98,
  });
  let below = y + 10;
  if (company.iban) {
    // RIB de l'atelier : règlement par virement
    doc.text(
      `Règlement par virement : IBAN ${formatIban(company.iban)}${company.bic ? ` · BIC ${company.bic}` : ''}`,
      MARGIN,
      below,
      { maxWidth: 98 },
    );
    below += 6;
  }
  const gesture = offeredSentence(documentLines);
  if (gesture) {
    doc.setTextColor(...BRAND);
    doc.text(gesture, MARGIN, below, { maxWidth: 98 });
  }

  // Facture sans TVA : la mention d'exonération en premier
  const exemption = invoice.vat_exempt && invoice.vat_exempt_mention ? [invoice.vat_exempt_mention] : [];
  drawMentions(doc, [...exemption, ...company.invoice_legal_mentions], totalsEnd + 10);
  drawFooter(doc, proforma ? ['Facture pro forma : document sans valeur comptable.'] : []);

  const fileName = proforma
    ? pdfFileName('Proforma', invoice.vehicle_label ?? 'client')
    : pdfFileName('Facture', invoice.number, invoice.vehicle_label ?? 'client');
  return { doc, fileName };
}

export interface CreditNotePdfInput {
  creditNote: CreditNote;
  invoice: Pick<InvoiceOverview, 'number' | 'issued_at' | 'client_name' | 'vehicle_label'>;
  company: CompanySettings;
  logo: string | null;
}

/** Avoir au format de l'ancienne appli (montants négatifs, en-tête de tableau rouge). */
export async function buildCreditNotePdf({ creditNote, invoice, company, logo }: CreditNotePdfInput) {
  const { doc, table } = await createPdf();
  drawLetterhead(doc, company, logo, 'AVOIR');

  let y = 44;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Avoir n° ${creditNote.number}`, MARGIN, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Date : ${pdfDate(new Date(creditNote.issued_at))}`, MARGIN, y);
  y += 6;
  doc.text(
    `En déduction de la facture n° ${invoice.number ?? '-'}${invoice.issued_at ? ` du ${pdfDate(new Date(invoice.issued_at))}` : ''}`,
    MARGIN,
    y,
  );
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(pdfText(`Client : ${invoice.client_name ?? '-'}`), MARGIN, y);
  y += 6;
  doc.text(pdfText(`Véhicule : ${invoice.vehicle_label ?? '-'}`), MARGIN, y);
  y += 10;

  y =
    table({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Motif', 'Montant HT']],
      body: [[pdfText(creditNote.reason || 'Avoir client'), `-${pdfMoney(creditNote.amount_ht)}`]],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { cellWidth: 35, halign: 'right' } },
    }) + 8;

  const label = PAGE_W - MARGIN - 55;
  const right = PAGE_W - MARGIN;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Total HT :', label, y);
  doc.text(`-${pdfMoney(creditNote.amount_ht)}`, right, y, { align: 'right' });
  y += 6;
  doc.text(`TVA (${String(creditNote.vat_rate).replace('.', ',')}%) :`, label, y);
  doc.text(`-${pdfMoney(creditNote.total_vat ?? 0)}`, right, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total TTC :', label, y);
  doc.text(`-${pdfMoney(creditNote.total_ttc ?? 0)}`, right, y, { align: 'right' });

  return { doc, fileName: pdfFileName('Avoir', creditNote.number, invoice.vehicle_label ?? 'client') };
}
