import type { CompanySettings } from '@/features/settings/api';
import { createPdf, drawLetterhead, GREEN, MARGIN, pdfDate, pdfFileName, pdfText } from '@/lib/pdf';
import type { VehicleDetail } from './api';
import { monthLabel } from '@/lib/month';
import { DEADLINE_LABELS } from './domain';

const frenchDate = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'non renseigné';

/** Une ligne par travail ou pièce (pdfText remplace aussi les retours à la ligne). */
const cell = (items: string[]) => items.map(pdfText).join('\n');

/** Lignes du carnet : une par passage, du plus ancien au plus récent (travaux, pièces, facture). */
export function maintenanceBookRows({ orders, lines, invoiceNumbers }: VehicleDetail): string[][] {
  return [...orders].reverse().map((order) => {
    const done = lines.filter((line) => line.repair_order_id === order.id);
    const firstLine = (text: string) => text.split('\n')[0] ?? '';
    const work = done
      .filter((line) => line.line_type === 'labor' || line.line_type === 'package')
      .map((line) => firstLine(line.description));
    const parts = done.filter((line) => line.line_type === 'part').map((line) => firstLine(line.description));
    return [
      pdfDate(new Date(order.created_at)),
      order.number,
      order.mileage ? pdfText(order.mileage.toLocaleString('fr-FR')) : '-',
      cell(work.length ? work : [order.requested_work || '-']),
      cell(parts.length ? parts : ['-']),
      invoiceNumbers[order.id]?.join('\n') ?? '-',
    ];
  });
}

/** Carnet d'entretien du véhicule (format de l'ancienne appli). */
export async function buildMaintenanceBookPdf(
  detail: VehicleDetail,
  company: CompanySettings,
  logo: string | null,
  now = new Date(),
) {
  const { doc, table } = await createPdf();
  const { vehicle, orders } = detail;
  drawLetterhead(doc, company, logo, "CARNET D'ENTRETIEN");

  let y = 46;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(pdfText(`Véhicule : ${vehicle.plate}`), MARGIN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(pdfText(`Client : ${vehicle.client_name ?? '-'}`), MARGIN, y + 6);
  doc.text(`Édité le ${pdfDate(now)} · ${orders.length} intervention(s)`, MARGIN, y + 12);
  doc.text(
    pdfText(
      `${DEADLINE_LABELS.ct} : ${frenchDate(vehicle.ct_due_date)}    ${DEADLINE_LABELS.tailgate} : ${monthLabel(vehicle.tailgate_due_date)}`,
    ),
    MARGIN,
    y + 18,
  );
  y += 26;

  table({
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', 'OR', 'Km', 'Travaux effectués', 'Pièces remplacées', 'Facture']],
    body: maintenanceBookRows(detail),
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [180, 180, 180], lineWidth: 0.2, valign: 'top' },
    headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 20 }, 2: { cellWidth: 16 }, 5: { cellWidth: 18 } },
  });

  return { doc, fileName: pdfFileName('Carnet_entretien', vehicle.plate_key ?? vehicle.plate) };
}
