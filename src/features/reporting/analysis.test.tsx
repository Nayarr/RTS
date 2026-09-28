import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayIso } from '@/features/repair-orders/schemas';
import { renderRoutes } from '@/test/render';
import {
  gapTone,
  groupByClient,
  hoursGapPercent,
  periodRange,
  realHourlyRate,
  scoreTechnicians,
  scoreTone,
} from './analysis';
import {
  fetchProfitability,
  fetchTechnicianPerformance,
  type ProfitabilityRow,
  type TechnicianPerformanceRow,
} from './api';
import { PerformancePage } from './PerformancePage';
import { ProfitabilityPage } from './ProfitabilityPage';

vi.mock('./api', () => ({ fetchProfitability: vi.fn(), fetchTechnicianPerformance: vi.fn() }));

const row = (overrides: Partial<ProfitabilityRow> = {}): ProfitabilityRow => ({
  client_id: 'c1',
  client_name: 'Transports Dupont',
  vehicle_id: 'v1',
  plate: 'AB-123-CD',
  ro_count: 1,
  labor_ht: 300,
  parts_ht: 200,
  parts_margin_ht: 80,
  billed_hours: 3,
  worked_hours: 4,
  client_unpaid_ttc: 600,
  ...overrides,
});

const rows = [
  row(),
  row({
    vehicle_id: 'v2',
    plate: 'EF-456-GH',
    labor_ht: 900,
    parts_ht: 0,
    parts_margin_ht: 0,
    billed_hours: 10,
    worked_hours: 8,
  }),
  row({
    client_id: 'c2',
    client_name: 'Logistique Martin',
    vehicle_id: 'v3',
    plate: 'IJ-789-KL',
    labor_ht: 100,
    parts_ht: 50,
    parts_margin_ht: -5,
    billed_hours: 1,
    worked_hours: 0,
    client_unpaid_ttc: 0,
  }),
];

const tech = (overrides: Partial<TechnicianPerformanceRow> = {}): TechnicianPerformanceRow => ({
  technician_id: 't1',
  name: 'Alice',
  color: '#137017',
  labor_ht: 1000,
  ro_count: 4,
  billed_hours: 9,
  worked_hours: 10,
  presence_hours: 20,
  estimate_deviation_percent: 10,
  average_lead_days: 2.5,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(fetchProfitability).mockResolvedValue(rows);
  vi.mocked(fetchTechnicianPerformance).mockResolvedValue([
    tech(),
    tech({
      technician_id: 't2',
      name: 'Bruno',
      labor_ht: 0,
      ro_count: 0,
      billed_hours: 0,
      worked_hours: 0,
      presence_hours: null,
      estimate_deviation_percent: null,
      average_lead_days: null,
    }),
  ]);
});

describe('pilotage : périodes', () => {
  it('début de la semaine, du mois, du trimestre, de l’année ; rien pour « tout »', () => {
    expect(periodRange('semaine', '2026-10-01')).toEqual({ from: '2026-09-28', to: null });
    expect(periodRange('mois', '2026-10-15')).toEqual({ from: '2026-10-01', to: null });
    expect(periodRange('trimestre', '2026-02-10')).toEqual({ from: '2025-12-01', to: null });
    expect(periodRange('annee', '2026-10-15')).toEqual({ from: '2026-01-01', to: null });
    expect(periodRange('tout', '2026-10-15')).toEqual({ from: null, to: null });
  });
});

describe('rentabilité : règles', () => {
  it('regroupement par client, du plus gros CA au plus petit, et total', () => {
    const { clients, total } = groupByClient(rows);
    expect(clients.map((c) => [c.client_name, c.labor_ht + c.parts_ht, c.ro_count])).toEqual([
      ['Transports Dupont', 1400, 2],
      ['Logistique Martin', 150, 1],
    ]);
    expect(clients[0]?.vehicles.map((v) => v.plate)).toEqual(['EF-456-GH', 'AB-123-CD']);
    expect(clients[0]?.unpaid_ttc).toBe(600); // compté une fois par client
    expect(total).toMatchObject({ ro_count: 3, labor_ht: 1300, parts_margin_ht: 75, unpaid_ttc: 600 });
  });

  it('écart d’heures, taux réel', () => {
    expect(hoursGapPercent(row())).toBeCloseTo(33.33, 1);
    expect(hoursGapPercent(row({ worked_hours: 0 }))).toBeNull();
    expect([gapTone(33), gapTone(10), gapTone(-20), gapTone(null)]).toEqual([
      'bad',
      'neutral',
      'good',
      'neutral',
    ]);
    expect(realHourlyRate(row())).toBe(75);
    expect(realHourlyRate(row({ worked_hours: 0 }))).toBeNull();
  });
});

describe('performance : note sur 100', () => {
  it('pondération rendement / occupation / CA / précision ; critères absents ignorés', () => {
    const [alice, bruno] = scoreTechnicians([
      tech(),
      tech({
        technician_id: 't2',
        name: 'Bruno',
        labor_ht: 500,
        presence_hours: null,
        estimate_deviation_percent: null,
      }),
    ]);
    // Alice : rendement 90, occupation 50, CA 100, précision 90
    expect(alice?.efficiency).toBe(90);
    expect(alice?.occupancy).toBe(50);
    expect(alice?.score).toBeCloseTo(0.35 * 90 + 0.25 * 50 + 0.25 * 100 + 0.15 * 90, 5);
    // Bruno : rendement 90, CA 50 (occupation et précision absentes)
    expect(bruno?.occupancy).toBeNull();
    expect(bruno?.score).toBeCloseTo((0.35 * 90 + 0.25 * 50) / 0.6, 5);
    expect(
      scoreTechnicians([
        tech({ labor_ht: 0, worked_hours: 0, presence_hours: null, estimate_deviation_percent: null }),
      ])[0]?.score,
    ).toBeNull();
    expect([scoreTone(80), scoreTone(60), scoreTone(20), scoreTone(null)]).toEqual([
      'good',
      'warning',
      'bad',
      'neutral',
    ]);
  });
});

describe('pilotage : écrans', () => {
  it('rentabilité : clients, détail par véhicule, total, période dans l’adresse', async () => {
    renderRoutes([{ path: '/pilotage/rentabilite', element: <ProfitabilityPage /> }], {
      initialPath: '/pilotage/rentabilite?periode=tout',
    });
    const dupont = await screen.findByRole('button', { name: 'Transports Dupont' });
    expect(fetchProfitability).toHaveBeenCalledWith({ from: null, to: null });
    expect(screen.getByRole('button', { name: 'Tout' })).toHaveAttribute('aria-pressed', 'true');
    expect(dupont.closest('tr')).toHaveTextContent(
      /2\s*1\s400\s€\s*1\s200\s€\s*200\s€\s*80\s€\s*13 h\s*12 h\s*-8 %\s*100\s€\/h\s*600\s€/,
    );
    expect(screen.queryByRole('link', { name: 'AB-123-CD' })).toBeNull();

    await userEvent.click(dupont);
    expect(dupont).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'AB-123-CD' })).toHaveAttribute('href', '/vehicules/v1');
    expect(screen.getByRole('link', { name: 'AB-123-CD' }).closest('tr')).toHaveTextContent('+33 %');
    expect(screen.getByRole('row', { name: /^Total/ })).toHaveTextContent(/3\s*1\s550\s€/);

    await userEvent.click(screen.getByRole('button', { name: 'Ce mois' }));
    await waitFor(() =>
      expect(vi.mocked(fetchProfitability).mock.lastCall?.[0]).toEqual({
        from: `${todayIso().slice(0, 7)}-01`,
        to: null,
      }),
    );
  });

  it('performance : techniciens classés par note', async () => {
    renderRoutes([{ path: '/pilotage/performance', element: <PerformancePage /> }], {
      initialPath: '/pilotage/performance',
    });
    const alice = await screen.findByRole('article', { name: 'Alice' });
    expect(screen.getByRole('button', { name: 'Ce mois' })).toHaveAttribute('aria-pressed', 'true');
    expect(alice).toHaveTextContent('83/100');
    expect(alice).toHaveTextContent(/CA MO : 1\s000\s€/);
    expect(alice).toHaveTextContent('Rendement : 90 %');
    expect(alice).toHaveTextContent('Occupation : 50 %');
    expect(alice).toHaveTextContent('Précision estim. : ±10 %');
    expect(alice).toHaveTextContent('Délai moyen : 2,5 j');
    const bruno = screen.getByRole('article', { name: 'Bruno' });
    expect(bruno).toHaveTextContent('0/100');
    expect(bruno).toHaveTextContent('Rendement : —');
    expect(screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual([
      'Alice',
      'Bruno',
    ]);
  });
});
