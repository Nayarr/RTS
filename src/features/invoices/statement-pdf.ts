import type { CellHookData, RowInput } from 'jspdf-autotable';
import type { CompanySettings } from '@/features/settings/api';
import { createPdf, MARGIN, PAGE_W, pdfDate, pdfFileName, pdfMoney, pdfText } from '@/lib/pdf';
import {
  CONTENT_BOTTOM,
  drawClientBox,
  drawDocumentHeader,
  drawFooter,
  drawMeta,
  HEAD,
  INK,
  MUTED,
  PANEL,
  RULE,
} from '@/lib/pdf-document';
import { STATEMENT_COLUMNS, statementTotals, type StatementRow } from './statement';
import type { StatementClient } from './statement-api';

const isoDate = (value: string) => new Date(`${value}T12:00:00`);
/** « 07/08/26 », comme le relevé de l'ancien logiciel. */
const shortDate = (value: string) => (value ? value.slice(2).split('-').reverse().join('/') : '');
const money = (value: number | null) => (value === null ? '' : pdfMoney(value).replace(' €', ''));

export interface StatementPdfInput {
  client: StatementClient;
  clientNumber: string | null;
  rows: StatementRow[];
  period: { from: string; to: string };
  company: CompanySettings;
  logo: string | null;
  now?: Date;
}

/** Extrait de compte (relevé de factures) : une ligne par facture ou avoir, totaux du filtre. */
export async function buildStatementPdf({
  client,
  clientNumber,
  rows,
  period,
  company,
  logo,
  now = new Date(),
}: StatementPdfInput) {
  const kit = await createPdf();
  const { doc, table } = kit;
  drawDocumentHeader(doc, company, logo, 'Extrait de compte', '');

  const meta: [string, string][] = [];
  if (clientNumber) meta.push(['N° client', clientNumber]);
  meta.push(['Date', pdfDate(now)]);
  const metaEnd = drawMeta(doc, meta);
  const boxEnd = drawClientBox(doc, 'Client', client);

  let y = Math.max(metaEnd, boxEnd) + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(
    `RELEVÉ DE FACTURES DU ${pdfDate(isoDate(period.from))} AU ${pdfDate(isoDate(period.to))}`,
    PAGE_W - MARGIN,
    y,
    { align: 'right' },
  );
  y += 5;

  const totals = statementTotals(rows);
  const body: RowInput[] = rows.map((row) => [
    shortDate(row.date),
    row.number,
    pdfText(row.plate),
    pdfText(row.brand),
    pdfText(row.model),
    money(row.ht),
    money(row.vat),
    money(row.ttc),
    money(row.paid),
    money(row.due),
    pdfText(row.state),
  ]);
  const amountColumns = new Set(STATEMENT_COLUMNS.flatMap((column, index) => (column.amount ? [index] : [])));
  const creditRows = new Set(rows.flatMap((row, index) => (row.kind === 'credit' ? [index] : [])));

  table({
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 297 - CONTENT_BOTTOM },
    head: [STATEMENT_COLUMNS.map((column) => column.label)],
    body,
    foot: [
      [
        { content: 'TOTAL', colSpan: 5, styles: { halign: 'right' } },
        money(totals.ht),
        money(totals.vat),
        money(totals.ttc),
        money(totals.paid),
        money(totals.due),
        '',
      ],
    ],
    showFoot: 'lastPage',
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      textColor: INK,
      cellPadding: { top: 2.2, bottom: 2.2, left: 1.6, right: 1.6 },
      lineColor: RULE,
      lineWidth: { bottom: 0.25 },
      valign: 'middle',
    },
    headStyles: { fillColor: HEAD, textColor: MUTED, fontSize: 6.4, fontStyle: 'normal' },
    footStyles: { fillColor: PANEL, textColor: INK, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 15 },
      2: { cellWidth: 19 },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 17 },
      6: { cellWidth: 14 },
      7: { cellWidth: 17 },
      8: { cellWidth: 17 },
      9: { cellWidth: 17 },
    },
    didParseCell: (data: CellHookData) => {
      if (amountColumns.has(data.column.index)) data.cell.styles.halign = 'right';
      if (data.section === 'body' && amountColumns.has(data.column.index)) data.cell.styles.font = 'courier';
      if (data.section === 'body' && creditRows.has(data.row.index)) data.cell.styles.textColor = MUTED;
      if (data.section === 'body' && data.column.index === 9 && (rows[data.row.index]?.due ?? 0) > 0.01)
        data.cell.styles.fontStyle = 'bold';
    },
  });

  drawFooter(doc, [`Montants en euros. Reste dû après paiements et avoirs : ${pdfMoney(totals.due)} TTC.`]);

  const fileName = pdfFileName('Extrait', client.name, period.from, period.to);
  return { doc, fileName };
}
