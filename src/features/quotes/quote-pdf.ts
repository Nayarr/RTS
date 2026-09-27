import type { CellInput, RowInput } from 'jspdf-autotable';
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
  TITLE_GREEN,
} from '@/lib/pdf';
import type { QuoteLine, QuoteOverview } from './api';
import { computeTotals, lineNet, pricedDoneLines } from './domain';

export interface QuotePdfInput {
  quote: QuoteOverview;
  lines: QuoteLine[];
  company: CompanySettings;
  logo: string | null;
  /** Date de génération (imprimée en haut à droite). */
  now?: Date;
}

/** Lignes imprimées : travaux déjà effectués (avec prix) puis travaux à prévoir. */
export function printedSections(lines: QuoteLine[]) {
  return {
    done: pricedDoneLines(lines),
    planned: lines.filter((line) => line.section === 'planned'),
  };
}

/** Devis au format de l'ancienne appli (colonnes quantité / remise seulement si utiles). */
export async function buildQuotePdf({ quote, lines, company, logo, now = new Date() }: QuotePdfInput) {
  const { doc, table } = await createPdf();
  drawLetterhead(doc, company, logo, 'DEVIS');

  let y = 44;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Devis n° ${quote.number ?? '—'}`, MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  doc.text(`Date : ${pdfDate(now)} à ${time}`, PAGE_W - MARGIN, y, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(pdfText(`Client : ${quote.client_name ?? '—'}`), MARGIN, y);
  y += 7;
  doc.text(pdfText(`Véhicule : ${quote.plate ?? '—'}`), MARGIN, y);
  y += 10;

  const drawTable = (list: QuoteLine[], title: string) => {
    if (list.length === 0) return;
    if (title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...TITLE_GREEN);
      doc.text(title, MARGIN, y);
      y += 6;
      doc.setTextColor(0, 0, 0);
    }
    const priced = list.filter((line) => line.line_type !== 'text');
    const hasQuantity = priced.some((line) => line.quantity !== 1);
    const hasDiscount = priced.some((line) => line.discount_percent > 0);
    const columns = 1 + (hasQuantity ? 2 : 1) + (hasDiscount ? 2 : 0);
    const head = ['Prestation / pièce'];
    if (hasQuantity) head.push('Prix unit. HT', 'Qté');
    else head.push('Prix HT');
    if (hasDiscount) head.push('Remise', 'Net HT');

    const body: RowInput[] = list.map((line) => {
      if (line.line_type === 'text') {
        return [
          {
            content: pdfText(line.description),
            colSpan: columns,
            styles: { fontStyle: 'italic', textColor: [90, 90, 90] },
          },
        ];
      }
      const price = line.unit_price ?? 0;
      const row: CellInput[] = [pdfText(line.description) || '—'];
      if (hasQuantity) row.push(pdfMoney(price), String(line.quantity));
      else row.push(pdfMoney(price));
      if (hasDiscount) {
        row.push(
          line.discount_percent > 0 ? `${line.discount_percent.toFixed(0)} %` : '—',
          pdfMoney(lineNet(line)),
        );
      }
      return row;
    });

    y =
      table({
        startY: y,
        margin: { left: MARGIN, right: MARGIN },
        head: [head],
        body,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 3, lineColor: [180, 180, 180], lineWidth: 0.2 },
        headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
      }) + 10;
  };

  const { done, planned } = printedSections(lines);
  drawTable(done, done.length ? 'Travaux déjà effectués' : '');
  drawTable(planned, done.length ? 'Travaux à prévoir' : '');

  const totals = computeTotals([...done, ...planned]);
  if (totals.ht > 0) {
    const label = PAGE_W - MARGIN - 55;
    const right = PAGE_W - MARGIN;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Total HT :', label, y);
    doc.text(pdfMoney(totals.ht), right, y, { align: 'right' });
    for (const { rate, amount } of totals.rates) {
      y += 6;
      doc.text(`TVA (${String(rate).replace('.', ',')}%) :`, label, y);
      doc.text(pdfMoney(amount), right, y, { align: 'right' });
    }
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Total TTC :', label, y);
    doc.text(pdfMoney(totals.ttc), right, y, { align: 'right' });
    y += 6;
    doc.setDrawColor(150, 150, 150);
    doc.line(label, y - 10, right, y - 10);
    y += 8;
  } else {
    y += 8;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const validUntil = quote.valid_until ? new Date(`${quote.valid_until}T12:00:00`) : null;
  const days = company.quote_validity_days;
  doc.text(
    `Devis valable ${days} jours${validUntil ? `, jusqu'au ${pdfDate(validUntil)}` : ''}. ` +
      'Prix hors taxes (HT). Merci de valider ci-dessous pour accord avant intervention.',
    MARGIN,
    y,
    { maxWidth: 180 },
  );
  y += 16;
  doc.line(MARGIN, y, MARGIN + 70, y);
  doc.text('Date et signature du client (bon pour accord)', MARGIN, y + 5);

  return { doc, fileName: pdfFileName('Devis', quote.number, quote.plate) };
}
