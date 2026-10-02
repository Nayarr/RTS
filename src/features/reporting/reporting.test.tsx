import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import { fetchMonthlyStatistics, fetchTreasury, type MonthlyStatistics, type TreasuryOverview } from './api';
import {
  barPercent,
  compactAmount,
  delayTone,
  formatDelay,
  monthLabel,
  monthLongLabel,
  shortDayLabel,
} from './domain';
import { StatisticsPage } from './StatisticsPage';
import { TreasuryPage } from './TreasuryPage';

vi.mock('./api', () => ({ fetchMonthlyStatistics: vi.fn(), fetchTreasury: vi.fn() }));

const month = (value: string, overrides: Partial<MonthlyStatistics> = {}): MonthlyStatistics => ({
  month: value,
  invoice_count: 0,
  labor_ht: 0,
  parts_ht: 0,
  parts_margin_ht: 0,
  credit_notes_ht: 0,
  total_ht: 0,
  ...overrides,
});

const treasury: TreasuryOverview = {
  collected_this_month: 4200.4,
  due_within_30_days: 880,
  overdue: 600,
  weeks: [
    { starts_on: '2026-09-28', amount: 0 },
    { starts_on: '2026-10-05', amount: 880 },
  ],
  overdue_by_client: [
    { client_id: 'c1', client_name: 'Transports Dupont', invoice_count: 1, amount: 600, max_days_late: 20 },
  ],
  payment_habits: [
    { client_id: 'c2', client_name: 'Logistique Martin', invoice_count: 3, average_delay_days: 8 },
    { client_id: 'c3', client_name: 'Garage Petit', invoice_count: 2, average_delay_days: -2 },
  ],
};

beforeEach(() => {
  vi.mocked(fetchMonthlyStatistics).mockResolvedValue([
    month('2026-08-01', {
      invoice_count: 4,
      labor_ht: 3000,
      parts_ht: 1200,
      parts_margin_ht: 350,
      total_ht: 4200,
    }),
    month('2026-09-01', {
      invoice_count: 1,
      labor_ht: 600,
      parts_ht: 400,
      parts_margin_ht: 150,
      credit_notes_ht: 100,
      total_ht: 900,
    }),
  ]);
  vi.mocked(fetchTreasury).mockResolvedValue(treasury);
});

describe('pilotage : règles', () => {
  it('libellés, montants compacts, hauteur des barres, délais', () => {
    expect(monthLabel('2026-09-01')).toBe('sept. 26');
    expect(monthLongLabel('2026-09-01')).toBe('Septembre 2026');
    expect(shortDayLabel('2026-10-05')).toBe('05/10');
    expect(compactAmount(12_540)).toBe('12,5k');
    expect(compactAmount(0)).toBe('');
    expect(barPercent(50, 200)).toBe(25);
    expect(barPercent(-10, 200)).toBe(0);
    expect(barPercent(10, 0)).toBe(0);
    expect([delayTone(-3), delayTone(3), delayTone(6)]).toEqual(['good', 'warning', 'bad']);
    expect([formatDelay(4), formatDelay(0), formatDelay(-2)]).toEqual(['+4 j', '0 j', '-2 j']);
  });
});

describe('pilotage : écrans', () => {
  it('statistiques : graphique et tableau du plus récent au plus ancien', async () => {
    renderRoutes([{ path: '/pilotage/statistiques', element: <StatisticsPage /> }], {
      initialPath: '/pilotage/statistiques',
    });
    expect(await screen.findByRole('figure', { name: 'Chiffre d’affaires HT par mois' })).toHaveTextContent(
      '4,2k',
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent(/sept\. 26\s*1\s*600\s€\s*400\s€\s*150\s€\s*−100\s€\s*900\s€/);
    expect(rows[1]).toHaveTextContent(/août 26\s*4\s*3\s000\s€\s*1\s200\s€\s*350\s€\s*—\s*4\s200\s€/);
    expect(screen.getByRole('link', { name: 'Statistiques' })).toHaveAttribute('aria-current', 'page');
  });

  it('statistiques : le survol d’une colonne affiche le détail du mois', async () => {
    const { container } = renderRoutes([{ path: '/pilotage/statistiques', element: <StatisticsPage /> }], {
      initialPath: '/pilotage/statistiques',
    });
    await screen.findByRole('figure', { name: 'Chiffre d’affaires HT par mois' });
    const column = (key: string) => container.querySelector(`[data-bar="${key}"] rect`)!;

    await userEvent.hover(column('2026-09-01'));
    const tip = screen.getByRole('tooltip');
    expect(within(tip).getByText('Septembre 2026')).toBeInTheDocument();
    expect(tip).toHaveTextContent(/Main d’œuvre \/ forfaits\s*600\s€/);
    expect(tip).toHaveTextContent(/Pièces\s*400\s€/);
    expect(tip).toHaveTextContent(/Marge pièces\s*150\s€/);
    expect(tip).toHaveTextContent(/Avoirs\s*−100\s€/);
    expect(tip).toHaveTextContent(/Total HT · 1 facture\s*900\s€/);

    // Autre colonne : son propre détail (pas d'avoir ce mois-là)
    await userEvent.hover(column('2026-08-01'));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/Août 2026.*Total HT · 4 factures\s*4\s200\s€/);
    expect(screen.getByRole('tooltip')).not.toHaveTextContent('Avoirs');

    await userEvent.unhover(screen.getByRole('figure', { name: 'Chiffre d’affaires HT par mois' }));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('trésorerie : chiffres clés, semaines, retards et habitudes', async () => {
    renderRoutes([{ path: '/pilotage/tresorerie', element: <TreasuryPage /> }], {
      initialPath: '/pilotage/tresorerie',
    });
    expect((await screen.findByText('Encaissé ce mois')).previousSibling).toHaveTextContent('4 200 €');
    expect(screen.getByText('À encaisser sous 30 j').previousSibling).toHaveTextContent('880 €');
    expect(screen.getByText('En retard').previousSibling).toHaveTextContent('600 €');
    expect(screen.getByRole('figure', { name: 'Encaissements attendus par semaine' })).toHaveTextContent(
      /28\/09.*05\/10.*880\s€/,
    );

    const late = screen.getByRole('row', { name: /Transports Dupont/ });
    expect(late).toHaveTextContent(/1\s*600,00\s€\s*20 j/);
    expect(within(late).getByRole('link', { name: 'Transports Dupont' })).toHaveAttribute(
      'href',
      '/clients/c1',
    );
    expect(screen.getByRole('cell', { name: '+8 j' })).toHaveClass('text-destructive');
    expect(screen.getByRole('cell', { name: '-2 j' })).toHaveClass('text-success');
  });

  it('trésorerie : aucun retard', async () => {
    vi.mocked(fetchTreasury).mockResolvedValue({ ...treasury, overdue_by_client: [], payment_habits: [] });
    renderRoutes([{ path: '/pilotage/tresorerie', element: <TreasuryPage /> }], {
      initialPath: '/pilotage/tresorerie',
    });
    expect(await screen.findByText('Aucun impayé en retard.')).toBeInTheDocument();
    expect(screen.getByText('Pas encore assez de paiements enregistrés.')).toBeInTheDocument();
  });
});
