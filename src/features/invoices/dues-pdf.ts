import type { CellHookData, RowInput } from 'jspdf-autotable';
import type { CompanySettings } from '@/features/settings/api';
import { createPdf, MARGIN, PAGE_W, pdfDate, pdfFileName, pdfMoney, pdfText } from '@/lib/pdf';
import {
  CONTENT_BOTTOM,
  drawDocumentHeader,
  drawFooter,
  drawMeta,
  HEAD,
  INK,
  MUTED,
  PANEL,
  RULE,
} from '@/lib/pdf-document';
import { duesTotals, type DuesGroup } from './dues';
import { STATEMENT_COLUMNS } from './statement';

const isoDate = (value: string) => new Date(`${value}T12:00:00`);
/** « 07/08/26 », comme l'extrait de compte. */
const shortDate = (value: string) => (value ? value.slice(2).split('-').reverse().join('/') : '');
const money = (value: number | null) => (value === null ? '' : pdfMoney(value).replace(' €', ''));
const time = (date: Date) => date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export interface DuesPdfInput {
  groups: DuesGroup[];
  period: { from: string; to: string };
  /** Types de compte retenus (libellés) ; vide : tous. */
  accounts: string[];
  company: CompanySettings;
  logo: string | null;
  now?: Date;
}

/**
 * Sommes dues par les clients : la forme de l'extrait de compte, un bloc par client (ses factures
 * restant à régler), le total de chaque client puis le total général. Reste dû à l'instant de l'export.
 */
export async function buildDuesPdf({
  groups,
  period,
  accounts,
  company,
  logo,
  now = new Date(),
}: DuesPdfInput) {
  const kit = await createPdf();
  const { doc, table } = kit;
  drawDocumentHeader(doc, company, logo, 'Sommes dues', '');

  const metaEnd = drawMeta(doc, [
    ['Situation au', `${pdfDate(now)} à ${time(now)}`],
    ['Règlement', accounts.length ? accounts.join(', ') : 'Tous'],
    ['Clients', String(groups.length)],
  ]);

  let y = metaEnd + 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(
    `SOMMES DUES SUR LES FACTURES DU ${pdfDate(isoDate(period.from))} AU ${pdfDate(isoDate(period.to))}`,
    PAGE_W - MARGIN,
    y,
    { align: 'right' },
  );
  y += 5;

  type Kind = 'client' | 'row' | 'subtotal';
  const kinds: Kind[] = [];
  const body: RowInput[] = [];
  for (const group of groups) {
    kinds.push('client');
    body.push([
      {
        content: pdfText(
          [group.client.name, group.clientNumber && `N° client ${group.clientNumber}`, group.account]
            .filter(Boolean)
            .join(' · '),
        ),
        colSpan: STATEMENT_COLUMNS.length,
      },
    ]);
    for (const row of group.rows) {
      kinds.push('row');
      body.push([
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
    }
    kinds.push('subtotal');
    body.push([
      { content: pdfText(`Total ${group.client.name}`), colSpan: 5, styles: { halign: 'right' } },
      money(group.totals.ht),
      money(group.totals.vat),
      money(group.totals.ttc),
      money(group.totals.paid),
      money(group.totals.due),
      '',
    ]);
  }

  const totals = duesTotals(groups);
  const amountColumns = new Set(STATEMENT_COLUMNS.flatMap((column, index) => (column.amount ? [index] : [])));
  table({
    startY: y,
    margin: { left: MARGIN, right: MARGIN, bottom: 297 - CONTENT_BOTTOM },
    head: [STATEMENT_COLUMNS.map((column) => column.label)],
    body,
    foot: [
      [
        { content: 'TOTAL GÉNÉRAL', colSpan: 5, styles: { halign: 'right' } },
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
      if (data.section !== 'body') {
        if (amountColumns.has(data.column.index)) data.cell.styles.halign = 'right';
        return;
      }
      const kind = kinds[data.row.index];
      if (kind === 'client') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8;
        data.cell.styles.cellPadding = { top: 4, bottom: 1.6, left: 1.6, right: 1.6 };
        return;
      }
      if (amountColumns.has(data.column.index)) {
        data.cell.styles.halign = 'right';
        if (kind === 'row') data.cell.styles.font = 'courier';
      }
      if (kind === 'subtotal') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = PANEL;
      }
      if (kind === 'row' && data.column.index === 9) data.cell.styles.fontStyle = 'bold';
    },
  });

  drawFooter(doc, [
    `Montants en euros. Reste dû après paiements et avoirs, à l’instant de l’export : ${pdfMoney(totals.due)} TTC.`,
  ]);

  const fileName = pdfFileName('Sommes_dues', period.from, period.to);
  return { doc, fileName };
}
