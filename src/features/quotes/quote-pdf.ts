import type { CompanySettings } from '@/features/settings/api';
import { createPdf, MARGIN, pdfDate, pdfFileName, pdfText } from '@/lib/pdf';
import {
  drawClientBox,
  drawDocumentHeader,
  drawFooter,
  drawLinesTable,
  drawMeta,
  drawTotals,
  ensureSpace,
  MUTED,
  offeredValue,
  RULE,
  type DocumentLine,
} from '@/lib/pdf-document';
import type { QuoteLine, QuoteOverview } from './api';
import { computeTotals, lineNet, pricedDoneLines } from './domain';

export interface QuotePdfInput {
  quote: QuoteOverview;
  lines: QuoteLine[];
  company: CompanySettings;
  logo: string | null;
  /** Coordonnées du client (adresse et SIRET dans le cadre « Devis pour »). */
  client?: { billing_address: string | null; siret: string | null } | null;
  /** Date de génération (« Établi le »). */
  now?: Date;
}

/** Lignes imprimées : travaux déjà effectués (avec prix) puis travaux à prévoir. */
export function printedSections(lines: QuoteLine[]) {
  return {
    done: pricedDoneLines(lines),
    planned: lines.filter((line) => line.section === 'planned'),
  };
}

const toDocumentLine = (line: QuoteLine): DocumentLine => ({
  line_type: line.line_type,
  description: line.description,
  unit_price: line.unit_price,
  quantity: line.quantity,
  discount_percent: line.discount_percent,
  net: lineNet(line),
});

/** Devis (maquette « PDF devis et facture ») : informations, client, lignes, totaux, bon pour accord. */
export async function buildQuotePdf({
  quote,
  lines,
  company,
  logo,
  client,
  now = new Date(),
}: QuotePdfInput) {
  const kit = await createPdf();
  const { doc } = kit;
  drawDocumentHeader(doc, company, logo, 'Devis', quote.number ?? 'Brouillon');

  const validUntil = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`) : null;
  const meta: [string, string][] = [['Établi le', pdfDate(now)]];
  if (validUntil) meta.push(['Valable jusqu’au', pdfDate(validUntil)]);
  meta.push(['Véhicule', quote.plate ?? '-']);
  if (quote.repair_order_number) meta.push(['Réf. OR', quote.repair_order_number]);
  const metaEnd = drawMeta(doc, meta);
  const boxEnd = drawClientBox(doc, 'Devis pour', {
    name: quote.client_name ?? '-',
    billing_address: client?.billing_address,
    siret: client?.siret,
  });

  const { done, planned } = printedSections(lines);
  const sections = [
    { title: done.length ? 'Travaux déjà effectués' : null, lines: done.map(toDocumentLine) },
    { title: 'Réparations à prévoir', lines: planned.map(toDocumentLine) },
  ];
  let y = drawLinesTable(kit, sections, Math.max(metaEnd, boxEnd) + 8) + 8;

  const all = [...done, ...planned];
  const totals = { ...computeTotals(all), offered: offeredValue(all.map(toDocumentLine)) };
  y = ensureSpace(doc, y, 42);

  // Bon pour accord à gauche, totaux à droite
  const totalsEnd = drawTotals(doc, totals, y, company.default_vat_rate);
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.roundedRect(MARGIN, y, 98, totalsEnd - y, 3, 3, 'S');
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  doc.setTextColor(...MUTED);
  doc.text('BON POUR ACCORD', MARGIN + 5, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.text('Date, nom et signature du client', MARGIN + 5, y + 11.5);

  const days = company.quote_validity_days;
  drawFooter(doc, [
    pdfText(
      `Devis valable ${days} jours${validUntil ? `, jusqu'au ${pdfDate(validUntil)}` : ''}. ` +
        'Prix hors taxes (HT). Les heures de main d’œuvre sont comptées à l’heure entamée.',
    ),
  ]);

  return { doc, fileName: pdfFileName('Devis', quote.number, quote.plate) };
}
