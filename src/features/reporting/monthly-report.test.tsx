import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { todayIso } from '@/features/repair-orders/schemas';
import type { Settings } from '@/features/settings/api';
import { renderRoutes } from '@/test/render';
import { nextMonthStart, previousMonth, scoreTechnicians, type ClientProfitability } from './analysis';
import {
  fetchMonthlyReport,
  fetchProfitability,
  fetchTechnicianPerformance,
  type MonthlyReport,
  type ProfitabilityRow,
} from './api';
import { buildMonthlyReportPdf, monthlyReportTables, reportMonthLabel } from './monthly-report-pdf';
import type * as MonthlyReportPdf from './monthly-report-pdf';
import { StatisticsPage } from './StatisticsPage';

vi.mock('./api', () => ({
  fetchMonthlyStatistics: vi.fn().mockResolvedValue([]),
  fetchMonthlyReport: vi.fn(),
  fetchProfitability: vi.fn(),
  fetchTechnicianPerformance: vi.fn(),
}));
vi.mock('./monthly-report-pdf', async (importOriginal) => ({
  ...(await importOriginal<typeof MonthlyReportPdf>()),
  buildMonthlyReportPdf: vi.fn(),
}));
vi.mock('@/features/documents/pdf-context', () => ({ loadPdfContext: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const report: MonthlyReport = {
  month: '2026-08-01',
  figures: {
    revenue_ht: 12_540.4,
    labor_ht: 8000,
    parts_ht: 4640.4,
    parts_margin_ht: 1200,
    credit_notes_ht: 100,
    invoice_count: 10,
    collected_ttc: 11_000,
    outstanding_ttc: 5000,
    overdue_ttc: 1200,
    repair_orders_opened: 14,
    quotes_accepted: 3,
  },
  overdue_invoices: [
    {
      invoice_id: 'i1',
      number: 'F11890',
      client_name: 'Transports Dupont',
      issued_at: '2026-07-10T10:00:00+00:00',
      balance_due: 1200,
    },
  ],
  deadlines: [
    { plate: 'AB-123-CD', client_name: null, kind: 'ct', due_date: '2026-09-20', days_left: -9 },
    {
      plate: 'EF-456-GH',
      client_name: 'Logistique Martin',
      kind: 'tailgate',
      due_date: '2026-10-10',
      days_left: 11,
    },
  ],
};

const client: ClientProfitability = {
  client_id: 'c1',
  client_name: 'Transports Dupont',
  ro_count: 3,
  labor_ht: 2000,
  parts_ht: 500,
  parts_margin_ht: 150,
  billed_hours: 20,
  worked_hours: 18,
  unpaid_ttc: 0,
  vehicles: [],
};

const technicians = scoreTechnicians([
  {
    technician_id: 't1',
    name: 'Alice',
    color: null,
    labor_ht: 2000,
    ro_count: 3,
    billed_hours: 18,
    worked_hours: 20,
    presence_hours: null,
    estimate_deviation_percent: null,
    average_lead_days: null,
  },
]);

describe('rapport mensuel : règles', () => {
  it('mois précédent, borne de fin, libellé', () => {
    expect(previousMonth('2026-09-29')).toBe('2026-08');
    expect(previousMonth('2026-01-15')).toBe('2025-12');
    expect(nextMonthStart('2026-12')).toBe('2027-01-01');
    expect(reportMonthLabel('2026-08-01')).toBe('Août 2026');
  });

  it('contenu des tableaux : chiffres arrondis, avoirs, clients, techniciens, retards, échéances', () => {
    const tables = monthlyReportTables({ report, clients: [client], technicians });
    expect(tables.figures).toContainEqual(['Chiffre d’affaires HT', '12 540 €']);
    expect(tables.figures).toContainEqual(['  avoirs déduits', '-100 €']);
    expect(tables.figures).toContainEqual(['Panier moyen HT', '1 254 €']);
    expect(tables.figures).toContainEqual(['Devis acceptés', '3']);
    expect(tables.clients).toEqual([['Transports Dupont', '3', '2 500 €', '150 €', '—']]);
    expect(tables.technicians).toEqual([['Alice', '94', '2 000 €', '3', '90 %', '—']]);
    expect(tables.overdueInvoices).toEqual([['F11890', 'Transports Dupont', '10/07/2026', '1 200 €']]);
    expect(tables.deadlines).toEqual([
      ['AB-123-CD', '—', 'Contrôle technique', '20/09/2026', 'Dépassé'],
      ['EF-456-GH', 'Logistique Martin', 'Contrôle hayon', '10/10/2026', 'À venir'],
    ]);
  });

  it('mois vide : lignes « aucun »', () => {
    const tables = monthlyReportTables({
      report: {
        ...report,
        figures: { ...report.figures, invoice_count: 0, credit_notes_ht: 0 },
        overdue_invoices: [],
        deadlines: [],
      },
      clients: [],
      technicians: [],
    });
    expect(tables.figures).toContainEqual(['Panier moyen HT', '—']);
    expect(tables.figures.some(([label]) => label?.includes('avoirs'))).toBe(false);
    expect(tables.clients[0]?.[0]).toBe('Aucune facture');
    expect(tables.overdueInvoices[0]?.[0]).toBe('Aucune facture en retard');
    expect(tables.deadlines[0]?.[0]).toBe('Aucune échéance proche');
  });
});

describe('rapport mensuel : PDF', () => {
  it('génère un PDF lisible (texte du rapport présent)', async () => {
    const actual = await vi.importActual<typeof MonthlyReportPdf>('./monthly-report-pdf');
    const { doc, fileName } = await actual.buildMonthlyReportPdf(
      { report, clients: [client], technicians },
      {
        legal_name: 'RTS',
        address_line: '1 rue',
        postal_code: '95190',
        city: 'Goussainville',
      } as Settings['company'],
      null,
    );
    expect(fileName).toBe('Rapport_mensuel_2026-08.pdf');
    const text = doc.output();
    expect(text).toContain('RAPPORT MENSUEL');
    expect(text).toMatch(/Ao.{1,4}t 2026/); // « û » encodé dans le PDF
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});

describe('rapport mensuel : écran', () => {
  beforeEach(() => {
    vi.mocked(fetchMonthlyReport).mockResolvedValue(report);
    vi.mocked(fetchProfitability).mockResolvedValue([
      {
        client_id: 'c1',
        client_name: 'Transports Dupont',
        vehicle_id: 'v1',
        plate: 'AB-123-CD',
        ro_count: 1,
        labor_ht: 100,
        parts_ht: 0,
        parts_margin_ht: 0,
        billed_hours: 1,
        worked_hours: 1,
        client_unpaid_ttc: 0,
      } satisfies ProfitabilityRow,
    ]);
    vi.mocked(fetchTechnicianPerformance).mockResolvedValue([]);
    vi.mocked(loadPdfContext).mockResolvedValue({ settings: { company: {} } as Settings, logo: null });
    vi.mocked(buildMonthlyReportPdf).mockResolvedValue({
      doc: { output: () => new Blob(['%PDF']) } as never,
      fileName: 'Rapport_mensuel_2026-07.pdf',
    });
    URL.createObjectURL = vi.fn(() => 'blob:rapport');
    URL.revokeObjectURL = vi.fn();
  });

  it('choix du mois, génération puis aperçu', async () => {
    renderRoutes([{ path: '/pilotage/statistiques', element: <StatisticsPage /> }], {
      initialPath: '/pilotage/statistiques',
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Rapport mensuel' }));
    const month = screen.getByLabelText('Mois');
    expect(month).toHaveValue(previousMonth(todayIso()));
    await userEvent.clear(month);
    await userEvent.type(month, '2026-07');
    await userEvent.click(screen.getByRole('button', { name: 'Générer le rapport PDF' }));

    expect(await screen.findByTitle('Aperçu du PDF')).toHaveAttribute('src', 'blob:rapport');
    expect(screen.getByText('Rapport_mensuel_2026-07.pdf')).toBeInTheDocument();
    expect(fetchMonthlyReport).toHaveBeenCalledWith('2026-07-01');
    expect(fetchProfitability).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-08-01' });
    await waitFor(() =>
      expect(vi.mocked(buildMonthlyReportPdf).mock.calls[0]?.[0].clients.map((c) => c.client_name)).toEqual([
        'Transports Dupont',
      ]),
    );
  });
});
