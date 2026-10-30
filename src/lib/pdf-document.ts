import type { jsPDF } from 'jspdf';
import type { CellHookData, RowInput } from 'jspdf-autotable';
import type { CompanySettings } from '@/features/settings/api';
import { formatSiret } from './siret';
import { MARGIN, PAGE_W, pdfMoney, pdfText, type PdfKit } from './pdf';

/**
 * Mise en page des devis et factures (maquette Figma « PDF devis et facture ») :
 * en-tête société, numéro en grand, informations à gauche, client dans un cadre gris,
 * tableau Désignation / Qté / PU HT / Remise / Total HT, totaux dans un cadre gris.
 */
type Rgb = [number, number, number];
export const INK: Rgb = [24, 24, 22];
export const MUTED: Rgb = [112, 112, 106];
export const RULE: Rgb = [226, 226, 221];
export const PANEL: Rgb = [242, 242, 239];
export const HEAD: Rgb = [247, 247, 244];
export const BRAND: Rgb = [19, 112, 23];
const BADGE: Rgb = [226, 241, 226];

const RIGHT = PAGE_W - MARGIN;
const PAGE_H = 297;
/** Bas de la zone utile (au-dessus du pied de page). */
export const CONTENT_BOTTOM = 270;

const color = (doc: jsPDF, rgb: Rgb) => doc.setTextColor(...rgb);

/** Montant français : « 1 234,56 € » (espace simple, lisible par la police du PDF). */
export const docMoney = (value: number) => pdfMoney(value);

/** Quantité : « 2 h » pour la main d'œuvre, « 1,5 » sinon. */
export const docQuantity = (quantity: number, isLabor: boolean) =>
  `${String(quantity).replace('.', ',')}${isLabor ? ' h' : ''}`;

/** Coordonnées légales sous la raison sociale. */
function legalLine(company: CompanySettings) {
  return [
    company.legal_form && company.share_capital
      ? `${company.legal_form} au capital de ${company.share_capital}`
      : company.legal_form,
    company.siret && `SIRET ${formatSiret(company.siret)}`,
    company.vat_number && `TVA ${company.vat_number}`,
    company.rcs,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** En-tête : logo, raison sociale et coordonnées, type de document et numéro à droite. */
export function drawDocumentHeader(
  doc: jsPDF,
  company: CompanySettings,
  logo: string | null,
  kind: string,
  number: string,
) {
  // Logo RTS (réglages, sinon celui de l'appli), sans fond ajouté
  if (logo) {
    try {
      // Compressé sans perte : le PDF reste léger (lot de factures, pièce jointe)
      doc.addImage(logo, 'PNG', MARGIN - 4, 5, 26, 26, 'logo', 'FAST');
    } catch {
      // Logo illisible : l'en-tête reste lisible sans.
    }
  }

  const x = MARGIN + 24;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  color(doc, INK);
  doc.text(pdfText(company.legal_name), x, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  color(doc, MUTED);
  const contact = [
    `${company.address_line}, ${company.postal_code} ${company.city}`,
    company.email,
    company.phone,
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(pdfText(contact), x, 19.5, { maxWidth: 110 });
  const legal = legalLine(company);
  if (legal) doc.text(pdfText(legal), x, 23, { maxWidth: 110 });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  color(doc, BRAND);
  doc.text(kind.toUpperCase(), RIGHT, 14, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(18);
  color(doc, INK);
  doc.text(pdfText(number), RIGHT, 22.5, { align: 'right' });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, 32, RIGHT, 32);
}

/** Informations du document (dates, véhicule, OR) : libellé gris, valeur à droite. Renvoie l'ordonnée de fin. */
export function drawMeta(doc: jsPDF, rows: [string, string][], top = 41) {
  let y = top;
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    color(doc, MUTED);
    doc.text(label, MARGIN, y);
    doc.setFontSize(8.3);
    color(doc, INK);
    const lines = doc.splitTextToSize(pdfText(value), 60) as string[];
    doc.text(lines, MARGIN + 35, y);
    y += 6 + (lines.length - 1) * 3.6;
  }
  return y;
}

/** Cadre gris du client (« FACTURÉ À », « DEVIS POUR »). Renvoie l'ordonnée de fin. */
export function drawClientBox(
  doc: jsPDF,
  title: string,
  client: {
    name: string;
    billing_address?: string | null;
    siret?: string | null;
    vat_number?: string | null;
  },
  top = 37,
) {
  const x = 115;
  const width = RIGHT - x;
  const inner = x + 5;
  // Une ligne par ligne saisie (retours à la ligne gardés), coupées si trop longues
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  const address = (client.billing_address ?? '')
    .split(/\r?\n/)
    .flatMap((part) => doc.splitTextToSize(pdfText(part).trim(), width - 10) as string[])
    .filter(Boolean)
    .slice(0, 3);
  const height = 21 + address.length * 3.8 + (client.siret ? 4.5 : 0) + (client.vat_number ? 4.5 : 0);

  doc.setFillColor(...PANEL);
  doc.roundedRect(x, top, width, height, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.3);
  color(doc, MUTED);
  doc.text(title.toUpperCase(), inner, top + 7);
  doc.setFontSize(10.5);
  color(doc, INK);
  doc.text(pdfText(client.name || '-'), inner, top + 13, { maxWidth: width - 10 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.3);
  let y = top + 18.5;
  for (const line of address) {
    doc.text(line, inner, y);
    y += 3.8;
  }
  if (client.siret) {
    doc.setFontSize(7.3);
    color(doc, MUTED);
    doc.text(`SIRET ${formatSiret(client.siret)}`, inner, y + 0.7);
    y += 4.5;
  }
  if (client.vat_number) {
    // Facture sans TVA (autoliquidation, exonération) : n° de TVA du client
    doc.setFontSize(7.3);
    color(doc, MUTED);
    doc.text(`N° TVA ${client.vat_number}`, inner, y + 0.7);
  }
  return top + height;
}

export interface DocumentLine {
  line_type: string;
  description: string;
  unit_price: number | null;
  quantity: number;
  discount_percent: number;
  net: number;
  /** Ligne au forfait : quantité masquée (main d'œuvre d'une pro forma, sans les heures). */
  lumpSum?: boolean;
}

/** Ligne offerte (geste commercial) : remise de 100 % sur une ligne chiffrée. */
export const isOffered = (line: Pick<DocumentLine, 'line_type' | 'discount_percent' | 'unit_price'>) =>
  line.line_type !== 'text' && line.discount_percent >= 100 && (line.unit_price ?? 0) > 0;

export const OFFERED_LABEL = 'Offert à titre commercial';

/** Valeur offerte : prix × quantité des lignes à 100 % de remise. */
export const offeredValue = (lines: DocumentLine[]) =>
  Math.round(lines.filter(isOffered).reduce((sum, l) => sum + (l.unit_price ?? 0) * l.quantity * 100, 0)) /
  100;

/**
 * Tableau des lignes. `sections` : titres intercalés (« RÉPARATIONS À PRÉVOIR »…).
 * Renvoie l'ordonnée sous le tableau.
 */
export function drawLinesTable(
  kit: PdfKit,
  sections: { title: string | null; lines: DocumentLine[] }[],
  startY: number,
) {
  const { doc, table } = kit;
  const body: RowInput[] = [];
  const offeredRows = new Set<number>();
  const startPage = doc.getCurrentPageInfo().pageNumber;

  for (const section of sections) {
    if (section.lines.length === 0) continue;
    if (section.title) {
      body.push([
        {
          content: section.title.toUpperCase(),
          colSpan: 5,
          styles: {
            fontSize: 6.6,
            fontStyle: 'bold',
            textColor: MUTED,
            cellPadding: { top: 3.4, bottom: 3.4, left: 4, right: 4 },
          },
        },
      ]);
    }
    for (const line of section.lines) {
      if (line.line_type === 'text') {
        body.push([
          {
            content: pdfText(line.description),
            colSpan: 5,
            styles: { fontStyle: 'italic', textColor: MUTED },
          },
        ]);
        continue;
      }
      const offered = isOffered(line);
      if (offered) offeredRows.add(body.length);
      body.push([
        pdfText(line.description) || '-',
        line.lumpSum ? '-' : docQuantity(line.quantity, line.line_type === 'labor'),
        docMoney(line.unit_price ?? 0),
        line.discount_percent > 0 ? `${String(line.discount_percent).replace('.', ',')} %` : '-',
        docMoney(line.net),
      ]);
    }
  }

  const finalY = table({
    startY,
    margin: { left: MARGIN, right: MARGIN, bottom: PAGE_H - CONTENT_BOTTOM },
    head: [['Désignation', 'Qté', 'PU HT', 'Remise', 'Total HT']],
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.2,
      textColor: INK,
      cellPadding: { top: 3.4, bottom: 3.4, left: 4, right: 4 },
      lineColor: RULE,
      lineWidth: { bottom: 0.25 },
      valign: 'middle',
    },
    headStyles: { fillColor: HEAD, textColor: MUTED, fontSize: 6.8, fontStyle: 'normal' },
    columnStyles: {
      1: { halign: 'right', cellWidth: 18, font: 'courier' },
      2: { halign: 'right', cellWidth: 27, font: 'courier' },
      3: { halign: 'center', cellWidth: 20, font: 'courier' },
      4: { halign: 'right', cellWidth: 28, font: 'courier' },
    },
    didParseCell: (data: CellHookData) => {
      if (data.section === 'head') {
        data.cell.styles.font = 'helvetica';
        if (data.column.index === 1 || data.column.index === 2 || data.column.index === 4)
          data.cell.styles.halign = 'right';
        if (data.column.index === 3) data.cell.styles.halign = 'center';
      }
      if (data.section === 'body' && offeredRows.has(data.row.index)) {
        data.cell.styles.cellPadding = { top: 3.4, bottom: 8.4, left: 4, right: 4 };
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== 'body' || !offeredRows.has(data.row.index)) return;
      const { cell } = data;
      if (data.column.index === 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        const width = doc.getTextWidth(OFFERED_LABEL) + 5;
        const y = cell.y + cell.height - 7.6;
        doc.setFillColor(...BADGE);
        doc.roundedRect(cell.x + 4, y, width, 4.4, 1.2, 1.2, 'F');
        doc.setTextColor(...BRAND);
        doc.text(OFFERED_LABEL, cell.x + 6.5, y + 3);
      }
      if (data.column.index === 2) {
        // Prix barré : la prestation est offerte.
        const text = Array.isArray(cell.text) ? cell.text.join('') : String(cell.text);
        doc.setFont('courier', 'normal');
        doc.setFontSize(8.2);
        const width = doc.getTextWidth(text);
        const x = cell.x + cell.width - 4;
        const y = cell.y + 3.4 + (cell.height - 3.4 - 8.4) / 2 + 0.2;
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.25);
        doc.line(x - width, y, x, y);
      }
    },
  });

  // Cadre arrondi autour du tableau quand il tient sur une page
  if (doc.getCurrentPageInfo().pageNumber === startPage) {
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.roundedRect(MARGIN, startY, RIGHT - MARGIN, finalY - startY, 2.5, 2.5, 'S');
  }
  return finalY;
}

export interface DocumentTotals {
  ht: number;
  vat: number;
  ttc: number;
  rates: { rate: number; amount: number }[];
  offered: number;
}

/** Cadre gris des totaux à droite. Renvoie l'ordonnée de fin. */
export function drawTotals(doc: jsPDF, totals: DocumentTotals, top: number, defaultRate: number) {
  const x = 120;
  const width = RIGHT - x;
  const rows: [string, string][] = [['Total HT', docMoney(totals.ht)]];
  if (totals.offered > 0) rows.push(['Dont offert', docMoney(totals.offered)]);
  const rates = totals.rates.length ? totals.rates : [{ rate: defaultRate, amount: totals.vat }];
  for (const { rate, amount } of rates)
    rows.push([`TVA ${String(rate).replace('.', ',')} %`, docMoney(amount)]);
  const height = 10 + rows.length * 5.6 + 12;

  doc.setFillColor(...PANEL);
  doc.roundedRect(x, top, width, height, 3, 3, 'F');
  let y = top + 8;
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    color(doc, MUTED);
    doc.text(label, x + 5, y);
    doc.setFont('courier', 'bold');
    doc.setFontSize(8.2);
    color(doc, INK);
    doc.text(value, RIGHT - 5, y, { align: 'right' });
    y += 5.6;
  }
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.25);
  doc.line(x + 5, y - 2.4, RIGHT - 5, y - 2.4);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  color(doc, INK);
  doc.text('Total TTC', x + 5, y);
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  color(doc, BRAND);
  doc.text(docMoney(totals.ttc), RIGHT - 5, y + 0.6, { align: 'right' });
  return top + height;
}

/** Phrase de geste commercial : « Geste commercial : le contrôle hayon vous est offert. » */
export function offeredSentence(lines: DocumentLine[]) {
  const names = lines
    .filter(isOffered)
    .map((line) => pdfText(line.description.split('\n')[0] ?? '').trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
  const [first] = names;
  if (names.length === 1 && first) return `Geste commercial : « ${lower(first)} » vous est offert.`;
  return `Geste commercial : ${names.map((n) => `« ${lower(n)} »`).join(', ')} vous sont offerts.`;
}

/** Mentions en petit, sous les totaux (CGV, pénalités…). Renvoie l'ordonnée de fin. */
export function drawMentions(doc: jsPDF, mentions: string[], top: number) {
  let y = top;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  color(doc, MUTED);
  for (const mention of mentions) {
    for (const line of doc.splitTextToSize(pdfText(mention), RIGHT - MARGIN) as string[]) {
      y = ensureSpace(doc, y, 3.2);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.6);
      color(doc, MUTED);
      doc.text(line, MARGIN, y);
      y += 3.2;
    }
    y += 1;
  }
  return y;
}

/** Pied de page : filet, courte mention et pagination sur chaque page. */
export function drawFooter(doc: jsPDF, mentions: string[]) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, 276, RIGHT, 276);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    color(doc, MUTED);
    let y = 280;
    for (const mention of mentions) {
      for (const line of doc.splitTextToSize(pdfText(mention), RIGHT - MARGIN) as string[]) {
        if (y > 290) break;
        doc.text(line, MARGIN, y);
        y += 2.9;
      }
    }
    doc.text(`Page ${page} / ${pages}`, RIGHT, 293, { align: 'right' });
  }
}

/** Nouvelle page si le bloc ne tient plus au-dessus du pied de page. */
export function ensureSpace(doc: jsPDF, y: number, needed: number) {
  if (y + needed <= CONTENT_BOTTOM) return y;
  doc.addPage();
  return 20;
}
