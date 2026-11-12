import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLaborRevenue, fetchMonthlyStatistics } from '@/features/reporting/api';
import { StatisticsPage } from '@/features/reporting/StatisticsPage';
import { renderRoutes } from '@/test/render';
import type { LaborRate } from './hooks';
import type { EditableLine } from './lines';
import { LineRow } from './LineRow';

const rates = vi.hoisted(() => ({ list: [] as unknown[] }));
// Taux horaires des réglages
vi.mock('./hooks', () => ({ useLaborRates: () => ({ data: rates.list }) }));
vi.mock('@/features/reporting/api', () => ({
  fetchMonthlyStatistics: vi.fn(),
  fetchLaborRevenue: vi.fn(),
}));

const rate = (category: LaborRate['category'], label: string, hourly_rate: number, sort_order: number) =>
  ({ id: `r-${label}`, category, label, labor_line_label: label, hourly_rate, sort_order }) as LaborRate;

beforeEach(() => {
  rates.list = [
    rate('pl', 'PL', 90, 1),
    rate('vul', 'VUL', 75, 2),
    rate('remorque', 'Soudure', 70, 3),
    rate('tolerie', 'Tôlerie/Carrosserie', 80, 4),
    rate(null, 'Électricité', 85, 100),
  ];
});

const labor = (overrides: Partial<EditableLine> = {}): EditableLine => ({
  id: 'l1',
  line_type: 'labor',
  description: 'Remplacement turbocompresseur',
  unit_price: 90,
  quantity: 6,
  hours: 6,
  discount_percent: 0,
  vat_rate: 20,
  labor_category: null,
  ...overrides,
});

const renderLine = (line: EditableLine, locked = false) => {
  const onSave = vi.fn();
  renderRoutes([
    { path: '/', element: <LineRow line={line} locked={locked} onSave={onSave} onDelete={vi.fn()} /> },
  ]);
  return onSave;
};

describe('catégorie de main d’œuvre sur les lignes', () => {
  it('sans catégorie : mécanique PL par défaut ; le stylo passe en soudure, au taux de la soudure', async () => {
    const onSave = renderLine(labor());
    expect(await screen.findByText('MO PL · 6 h')).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Changer la catégorie de main d’œuvre de Remplacement turbocompresseur',
      }),
    );
    const select = screen.getByRole('combobox', {
      name: 'Catégorie de main d’œuvre de Remplacement turbocompresseur',
    });
    // Seulement les quatre catégories de base
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['PL', 'VUL', 'Soudure', 'Tôlerie/Carrosserie']);
    await userEvent.selectOptions(select, 'remorque');
    expect(onSave).toHaveBeenCalledWith({ labor_category: 'remorque', unit_price: 70 });
  });

  it('prix négocié gardé ; chaque catégorie a sa couleur', async () => {
    const onSave = renderLine(labor({ labor_category: 'vul', unit_price: 60 }));
    const pill = await screen.findByText('MO VUL · 6 h');
    expect(pill.getAttribute('style')).toContain('#2A6B52');
    await userEvent.click(screen.getByRole('button', { name: /Changer la catégorie/ }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Catégorie de main/ }), 'tolerie');
    expect(onSave).toHaveBeenCalledWith({ labor_category: 'tolerie' });
  });

  it('document figé : pas de stylo', async () => {
    renderLine(labor({ labor_category: 'tolerie' }), true);
    expect(await screen.findByText('MO Tôlerie/Carrosserie · 6 h')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Changer la catégorie/ })).toBeNull();
  });
});

describe('CA par catégorie de main d’œuvre', () => {
  it('statistiques : un CA par catégorie, avec les heures facturées', async () => {
    vi.mocked(fetchMonthlyStatistics).mockResolvedValue([]);
    vi.mocked(fetchLaborRevenue).mockResolvedValue([
      { category: 'pl', label: 'PL', amount_ht: 12_600, hours: 140 },
      { category: 'vul', label: 'VUL', amount_ht: 1_500, hours: 20 },
      { category: 'remorque', label: 'Soudure', amount_ht: 700, hours: 10 },
      { category: 'tolerie', label: 'Tôlerie/Carrosserie', amount_ht: 0, hours: 0 },
    ]);
    renderRoutes([{ path: '/pilotage/statistiques', element: <StatisticsPage /> }], {
      initialPath: '/pilotage/statistiques',
    });
    const section = await screen.findByRole('region', {
      name: 'CA main d’œuvre par catégorie · 12 derniers mois',
    });
    const cards = within(section).getAllByRole('listitem');
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveTextContent(/Main d’œuvre PL\s*12\s600\s€\s*140 h facturées/);
    expect(cards[2]).toHaveTextContent(/Main d’œuvre Soudure\s*700\s€\s*10 h facturées/);
  });
});
