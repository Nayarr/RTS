import { DEADLINE_LABELS } from '@/features/customers/domain';
import type { CompanySettings } from '@/features/settings/api';
import {
  createPdf,
  drawLetterhead,
  GREEN,
  MARGIN,
  pdfDate,
  pdfFileName,
  pdfText,
  TITLE_GREEN,
} from '@/lib/pdf';
import { revenue, type ClientProfitability, type TechnicianScore } from './analysis';
import type { MonthlyReport } from './api';

export interface MonthlyReportData {
  report: MonthlyReport;
  /** Meilleurs clients du mois (5 au plus). */
  clients: ClientProfitability[];
  technicians: TechnicianScore[];
}

/** Montant arrondi à l'euro, comme l'ancien rapport (« 12 540 € »). */
const eur = (value: number) => pdfText(`${Math.round(value).toLocaleString('fr-FR')} €`);
const percent = (value: number | null) => (value === null ? '-' : `${Math.round(value)} %`);
const frenchDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** « 2026-03-01 » → « Mars 2026 » */
export function reportMonthLabel(month: string) {
  const label = new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Contenu des tableaux du rapport (testé sans générer le PDF). */
export function monthlyReportTables({ report, clients, technicians }: MonthlyReportData) {
  const f = report.figures;
  return {
    figures: [
      ['Chiffre d’affaires HT', eur(f.revenue_ht)],
      ['  dont main d’œuvre / forfaits', eur(f.labor_ht)],
      ['  dont pièces', eur(f.parts_ht)],
      ...(f.credit_notes_ht > 0 ? [['  avoirs déduits', `-${eur(f.credit_notes_ht)}`]] : []),
      ['Marge sur pièces', eur(f.parts_margin_ht)],
      ['Factures émises', String(f.invoice_count)],
      ['Panier moyen HT', f.invoice_count ? eur(f.revenue_ht / f.invoice_count) : '-'],
      ['Encaissé sur le mois (TTC)', eur(f.collected_ttc)],
      ['Reste à encaisser aujourd’hui (TTC)', eur(f.outstanding_ttc)],
      ['  dont en retard', eur(f.overdue_ttc)],
      ['OR ouverts sur le mois', String(f.repair_orders_opened)],
      ['Devis acceptés', String(f.quotes_accepted)],
    ],
    clients: clients.length
      ? clients.map((client) => [
          pdfText(client.client_name),
          String(client.ro_count),
          eur(revenue(client)),
          eur(client.parts_margin_ht),
          client.unpaid_ttc > 0 ? eur(client.unpaid_ttc) : '-',
        ])
      : [['Aucune facture', '', '', '', '']],
    technicians: technicians.length
      ? technicians.map((tech) => [
          pdfText(tech.name),
          tech.score === null ? '-' : String(Math.round(tech.score)),
          eur(tech.labor_ht),
          String(tech.ro_count),
          percent(tech.efficiency),
          percent(tech.occupancy),
        ])
      : [['-', '', '', '', '', '']],
    overdueInvoices: report.overdue_invoices.length
      ? report.overdue_invoices.map((invoice) => [
          invoice.number,
          pdfText(invoice.client_name),
          pdfDate(new Date(invoice.issued_at)),
          eur(invoice.balance_due),
        ])
      : [['Aucune facture en retard', '', '', '']],
    deadlines: report.deadlines.length
      ? report.deadlines.map((deadline) => [
          deadline.plate,
          pdfText(deadline.client_name ?? '-'),
          DEADLINE_LABELS[deadline.kind],
          frenchDay(deadline.due_date),
          deadline.days_left < 0 ? 'Dépassé' : 'À venir',
        ])
      : [['Aucune échéance proche', '', '', '', '']],
  };
}

/** Rapport mensuel de la direction (mise en page de l'ancienne appli). */
export async function buildMonthlyReportPdf(
  data: MonthlyReportData,
  company: CompanySettings,
  logo: string | null,
  now = new Date(),
) {
  const { doc, table } = await createPdf();
  const tables = monthlyReportTables(data);
  drawLetterhead(doc, company, logo, 'RAPPORT MENSUEL');

  let y = 46;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(reportMonthLabel(data.report.month), MARGIN, y);
  y += 4;

  const section = (title: string, head: string[], body: string[][], rightAligned: number[] = []) => {
    if (y > 250) {
      doc.addPage();
      y = 16;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...TITLE_GREEN);
    doc.text(title, MARGIN, y + 6);
    doc.setTextColor(0, 0, 0);
    y =
      table({
        startY: y + 8,
        margin: { left: MARGIN, right: MARGIN },
        head: [head],
        body,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2, lineColor: [190, 190, 190], lineWidth: 0.2 },
        headStyles: { fillColor: GREEN, textColor: 255, fontStyle: 'bold' },
        columnStyles: Object.fromEntries(rightAligned.map((index) => [index, { halign: 'right' }])),
      }) + 4;
  };

  section('Chiffres clés', ['Indicateur', 'Valeur'], tables.figures, [1]);
  section(
    'Meilleurs clients du mois',
    ['Client', 'OR', 'CA HT', 'Marge pièces', 'Impayés'],
    tables.clients,
    [1, 2, 3, 4],
  );
  section(
    'Techniciens',
    ['Technicien', 'Note /100', 'CA MO HT', 'OR facturés', 'Rendement', 'Occupation'],
    tables.technicians,
    [1, 2, 3, 4, 5],
  );
  section(
    'Factures en retard (à relancer)',
    ['Facture', 'Client', 'Date', 'Reste dû TTC'],
    tables.overdueInvoices,
    [3],
  );
  section(
    'Échéances véhicules dans les 30 jours',
    ['Véhicule', 'Client', 'Contrôle', 'Date', 'État'],
    tables.deadlines,
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Rapport généré le ${pdfDate(now)} · RTS Atelier`, MARGIN, 290);

  return { doc, fileName: pdfFileName('Rapport_mensuel', data.report.month.slice(0, 7)) };
}
