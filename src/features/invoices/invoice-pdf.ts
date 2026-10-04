import type { CellInput, RowInput } from 'jspdf-autotable';
import { computeTotals, lineNet } from '@/features/documents/lines';
import type { CompanySettings } from '@/features/settings/api';
import {
  createPdf,
  drawLetterhead,
  GREEN,
  MARGIN,
  PAGE_W,
  pdfDate,
  pdfFileName,
  pdfMoney,
  pdfText,
} from '@/lib/pdf';
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

/** Facture au format de l'ancienne appli : en-tête, dates, bloc client, lignes, totaux, mentions. */
export async function buildInvoicePdf({ invoice, lines, company, logo, proforma }: InvoicePdfInput) {
  const { doc, table } = await createPdf();
  drawLetterhead(doc, company, logo, proforma ? 'FACTURE PRO FORMA' : 'FACTURE');

  const now = proforma?.now ?? new Date();
  const issuedAt = proforma ? now : isoDate(invoice.issued_at ?? invoice.created_at);
  const dueDate = proforma
    ? new Date(now.getTime() + proforma.paymentTermsDays * 86_400_000)
    : isoDate(invoice.due_date ?? invoice.created_at);
  const client = proforma
    ? proforma.client
    : {
        name: invoice.client_name ?? '',
        billing_address: invoice.client_address,
        siren: invoice.client_siren,
      };

  let y = 44;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(
    proforma ? 'Facture pro forma : document sans valeur comptable' : `Facture n° ${invoice.number ?? ''}`,
    MARGIN,
    y,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`${proforma ? 'Établie le : ' : 'Date d’émission : '}${pdfDate(issuedAt)}`, MARGIN, y + 6);
  doc.text(
    `Date de la prestation : ${invoice.service_date ? pdfDate(isoDate(invoice.service_date)) : proforma ? pdfDate(now) : '-'}`,
    MARGIN,
    y + 11,
  );
  doc.text(`Date d’échéance : ${pdfDate(dueDate)}`, MARGIN, y + 16);
  doc.text(
    pdfText(
      `Véhicule : ${invoice.vehicle_label ?? '-'}${invoice.mileage ? `  ·  ${invoice.mileage} km` : ''}`,
    ),
    MARGIN,
    y + 21,
  );
  if (invoice.repair_order_numbers.length) {
    doc.text(`Réf. OR : ${invoice.repair_order_numbers.join(', ')}`, MARGIN, y + 26, { maxWidth: 95 });
  }

  // Bloc client à droite
  const cx = 118;
  doc.setDrawColor(180, 180, 180);
  doc.rect(cx - 3, y - 5, PAGE_W - MARGIN - cx + 3, 32);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(pdfText(client.name || '-'), cx, y + 1, { maxWidth: PAGE_W - MARGIN - cx });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const address = doc.splitTextToSize(
    pdfText(client.billing_address ?? ''),
    PAGE_W - MARGIN - cx - 2,
  ) as string[];
  address.slice(0, 3).forEach((line, index) => doc.text(line, cx, y + 6 + index * 4.5));
  if (client.siren) doc.text(`SIREN : ${pdfText(client.siren)}`, cx, y + 21);
  y += 34;

  const hasDiscount = lines.some((line) => line.line_type !== 'text' && line.discount_percent > 0);
  const head = ['Désignation', 'PU HT', 'Qté', ...(hasDiscount ? ['Remise'] : []), 'Total HT'];
  const body: RowInput[] = lines.map((line) => {
    if (line.line_type === 'text') {
      return [
        {
          content: pdfText(line.description),
          colSpan: head.length,
          styles: { fontStyle: 'italic', textColor: [90, 90, 90] },
        },
      ];
    }
    const row: CellInput[] = [
      pdfText(line.description) || '-',
      pdfMoney(line.unit_price ?? 0),
      String(line.quantity),
    ];
    if (hasDiscount) row.push(line.discount_percent > 0 ? `${line.discount_percent} %` : '-');
    row.push(pdfMoney(lineNet(line)));
    return row;
  });
  y =
    table({
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [head],
      body,
      theme: 'grid',
      styles: { fontSize: 9.5, cellPadding: 2.5, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
      columnStyles: hasDiscount
        ? {
            1: { halign: 'right', cellWidth: 24 },
            2: { halign: 'center', cellWidth: 14 },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'right', cellWidth: 26 },
          }
        : {
            1: { halign: 'right', cellWidth: 26 },
            2: { halign: 'center', cellWidth: 16 },
            3: { halign: 'right', cellWidth: 28 },
          },
    }) + 8;
  if (y > 250) {
    doc.addPage();
    y = 20;
  }

  // Totaux : figés à l'émission, recalculés pour un brouillon
  const computed = computeTotals(lines);
  const totals = proforma
    ? computed
    : { ...computed, ht: invoice.total_ht, vat: invoice.total_vat, ttc: invoice.total_ttc };
  const label = PAGE_W - MARGIN - 60;
  const right = PAGE_W - MARGIN;
  doc.setFontSize(10);
  doc.text('Total HT :', label, y);
  doc.text(pdfMoney(totals.ht), right, y, { align: 'right' });
  y += 6;
  if (totals.rates.length > 1) {
    for (const { rate, amount } of totals.rates) {
      doc.text(`TVA ${String(rate).replace('.', ',')} % :`, label, y);
      doc.text(pdfMoney(amount), right, y, { align: 'right' });
      y += 6;
    }
  } else {
    doc.text(
      `TVA ${String(totals.rates[0]?.rate ?? company.default_vat_rate).replace('.', ',')} % :`,
      label,
      y,
    );
    doc.text(pdfMoney(totals.vat), right, y, { align: 'right' });
    y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total TTC :', label, y);
  doc.text(pdfMoney(totals.ttc), right, y, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(150, 150, 150);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;
  doc.setFontSize(8);
  for (const mention of company.invoice_legal_mentions) {
    for (const line of doc.splitTextToSize(pdfText(mention), 182) as string[]) {
      if (y > 285) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, MARGIN, y);
      y += 3.8;
    }
    y += 1.2;
  }

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
