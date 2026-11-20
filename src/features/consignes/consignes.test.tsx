import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from '@/test/render';
import type { RoLine } from '@/features/repair-orders/api';
import { todayIso } from '@/features/repair-orders/schemas';
import { PartsSection } from '@/features/workshop/order/PartsSection';
import {
  addPartCore,
  deletePartCore,
  fetchPartCores,
  fetchRepairOrderCores,
  markPartCoresReturned,
  updatePartCore,
  type PartCore,
} from './api';
import type * as ConsignesApi from './api';
import { ConsignesPage } from './ConsignesPage';
import {
  coreStats,
  coreWaitingDays,
  groupBySupplier,
  isLateCore,
  matchesCoreFilter,
  partCoreFromForm,
  partCoreToForm,
} from './domain';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ConsignesApi>()),
  fetchPartCores: vi.fn(),
  fetchRepairOrderCores: vi.fn(),
  addPartCore: vi.fn(),
  deletePartCore: vi.fn(),
  updatePartCore: vi.fn(),
  markPartCoresReturned: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const core = (overrides: Partial<PartCore> = {}): PartCore =>
  ({
    id: 'k1',
    ro_line_id: 'l1',
    repair_order_id: 'ro1',
    repair_order_number: 'OR00012',
    vehicle_id: 'v1',
    vehicle_plate: 'GH-512-RT',
    supplier_id: 's1',
    supplier_name: 'Truck Parts Lyon',
    part_name: 'Alternateur 28V',
    brand: 'Bosch',
    reference: '0124655',
    quantity: 1,
    amount_ht: 120,
    status: 'to_return',
    returned_on: null,
    refunded_on: null,
    refunded_amount_ht: null,
    notes: null,
    created_by: null,
    created_at: daysAgo(2),
    updated_at: daysAgo(2),
    ...overrides,
  });

const cores = [
  core(),
  core({ id: 'k2', ro_line_id: 'l2', part_name: 'Étrier AV', amount_ht: 85, created_at: daysAgo(40) }),
  core({
    id: 'k3',
    ro_line_id: 'l3',
    part_name: 'Démarreur',
    supplier_name: 'Distri PL',
    amount_ht: 60,
    status: 'returned',
    returned_on: '2026-11-10',
  }),
  core({
    id: 'k4',
    ro_line_id: 'l4',
    part_name: 'Turbo',
    supplier_name: null,
    amount_ht: 300,
    status: 'refunded',
    returned_on: '2026-10-01',
    refunded_on: '2026-10-20',
    refunded_amount_ht: 250,
  }),
];

beforeEach(() => {
  vi.mocked(fetchPartCores).mockResolvedValue(cores);
  vi.mocked(markPartCoresReturned).mockResolvedValue(undefined);
  vi.mocked(updatePartCore).mockResolvedValue(undefined);
  vi.mocked(addPartCore).mockResolvedValue(undefined);
  vi.mocked(deletePartCore).mockResolvedValue(undefined);
});

describe('consignes : règles', () => {
  it('en cours = à renvoyer ou renvoyée', () => {
    expect(cores.filter((c) => matchesCoreFilter(c, 'open')).map((c) => c.id)).toEqual(['k1', 'k2', 'k3']);
    expect(cores.filter((c) => matchesCoreFilter(c, 'refunded')).map((c) => c.id)).toEqual(['k4']);
    expect(cores.filter((c) => matchesCoreFilter(c, 'all'))).toHaveLength(4);
  });

  it('attente : depuis la déclaration, puis depuis le renvoi ; rien une fois remboursée', () => {
    const today = '2026-11-20';
    expect(coreWaitingDays(core({ created_at: '2026-11-15T09:00:00Z' }), today)).toBe(5);
    expect(
      coreWaitingDays(
        core({ status: 'returned', returned_on: '2026-11-18', created_at: '2026-10-01' }),
        today,
      ),
    ).toBe(2);
    expect(coreWaitingDays(core({ status: 'refunded' }), today)).toBeNull();
  });

  it('en retard : au garage depuis plus de 30 jours (pas une pièce déjà renvoyée)', () => {
    const today = '2026-11-20';
    expect(isLateCore(core({ created_at: '2026-10-21T09:00:00Z' }), today)).toBe(false);
    expect(isLateCore(core({ created_at: '2026-10-20T09:00:00Z' }), today)).toBe(true);
    expect(
      isLateCore(core({ created_at: '2026-09-01', status: 'returned', returned_on: '2026-09-02' }), today),
    ).toBe(false);
  });

  it('statistiques : à renvoyer, montant pas encore remboursé, retards', () => {
    expect(coreStats(cores, todayIso())).toEqual({ toReturn: 2, pendingAmount: 265, late: 1 });
  });

  it('groupes par fournisseur, sans fournisseur en dernier, avec le total', () => {
    expect(
      groupBySupplier(cores).map(({ supplier, items, total }) => [supplier, items.length, total]),
    ).toEqual([
      ['Distri PL', 1, 60],
      ['Truck Parts Lyon', 2, 205],
      ['', 1, 300],
    ]);
  });

  it('formulaire : dates et avoir effacés quand le statut ne les concerne pas', () => {
    const values = partCoreToForm(cores[3]!);
    expect(values).toMatchObject({
      status: 'refunded',
      refunded_amount_ht: '250',
      returned_on: '2026-10-01',
    });
    expect(partCoreFromForm({ ...values, status: 'returned' })).toMatchObject({
      status: 'returned',
      returned_on: '2026-10-01',
      refunded_on: null,
      refunded_amount_ht: null,
    });
    expect(partCoreFromForm({ ...values, status: 'to_return' })).toMatchObject({ returned_on: null });
    expect(partCoreFromForm({ ...values, returned_on: '' })).toMatchObject({
      returned_on: null,
      amount_ht: 300,
    });
  });
});

const renderPage = () =>
  renderRoutes([{ path: '/consignes', element: <ConsignesPage /> }], { initialPath: '/consignes' });

describe('page Consignes', () => {
  it('chiffres clés, consignes en cours groupées par fournisseur, retard signalé', async () => {
    renderPage();
    expect(await screen.findByText('Anciennes pièces à renvoyer')).toBeInTheDocument();
    expect(screen.getByText('265,00 €')).toBeInTheDocument();
    const truck = screen.getByRole('region', { name: 'Truck Parts Lyon' });
    expect(within(truck).getByText('205,00 € HT')).toBeInTheDocument();
    expect(within(truck).getByText(/au garage depuis 40 j/)).toBeInTheDocument();
    expect(within(truck).getByText(/au garage depuis 2 j/)).toBeInTheDocument();
    expect(within(truck).getAllByRole('link', { name: 'OR00012' })[0]).toHaveAttribute('href', '/or/ro1');
    expect(screen.getByRole('region', { name: 'Distri PL' })).toBeInTheDocument();
    // Remboursée : seulement dans « Toutes » ou « Remboursée »
    expect(screen.queryByText('Turbo')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Toutes/ }));
    const none = screen.getByRole('region', { name: 'Sans fournisseur' });
    expect(within(none).getByText('avoir 250,00 €')).toBeInTheDocument();
  });

  it('renvoi groupé : seules les pièces encore au garage sont sélectionnables', async () => {
    renderPage();
    const truck = await screen.findByRole('region', { name: 'Truck Parts Lyon' });
    expect(within(screen.getByRole('region', { name: 'Distri PL' })).queryByRole('checkbox')).toBeNull();
    await userEvent.click(
      within(truck).getByRole('checkbox', { name: 'Tout sélectionner · Truck Parts Lyon' }),
    );
    const bar = screen.getByRole('region', { name: 'Renvoi groupé' });
    expect(bar).toHaveTextContent('2 anciennes pièces sélectionnées');
    await userEvent.click(within(bar).getByRole('button', { name: /Marquer renvoyées/ }));
    await waitFor(() => expect(markPartCoresReturned).toHaveBeenCalledWith(['k1', 'k2'], todayIso()));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Renvoi groupé' })).toBeNull());
  });

  it('suivi : remboursement avec avoir partiel', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Suivre la consigne de Démarreur' }));
    const dialog = screen.getByRole('dialog', { name: 'Consigne · Démarreur' });
    expect(within(dialog).getByLabelText('Renvoyée le')).toHaveValue('2026-11-10');
    expect(within(dialog).queryByLabelText('Avoir reçu HT (€)')).toBeNull();
    await userEvent.selectOptions(within(dialog).getByLabelText('Statut'), 'refunded');
    await userEvent.type(within(dialog).getByLabelText('Avoir reçu HT (€)'), '55');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updatePartCore).toHaveBeenCalledWith('k3', {
        supplier_name: 'Distri PL',
        amount_ht: 60,
        status: 'refunded',
        returned_on: '2026-11-10',
        refunded_on: null,
        refunded_amount_ht: 55,
        notes: null,
      }),
    );
  });

  it('aucune consigne : explication', async () => {
    vi.mocked(fetchPartCores).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Coche « Ancienne pièce en consigne »/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------- Écran du mécano

const partLine = (overrides: Partial<RoLine>): RoLine =>
  ({
    id: 'l1',
    repair_order_id: 'ro1',
    line_type: 'part',
    kind: 'done',
    position: 0,
    description: 'Alternateur 28V\nRéf. 0124',
    quantity: 1,
    order_status: 'received',
    ...overrides,
  }) as RoLine;

const renderSection = (locked = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PartsSection
        repairOrderId="ro1"
        locked={locked}
        lines={[
          partLine({}),
          partLine({ id: 'l2', description: 'Démarreur', order_status: 'ordered' }),
          partLine({ id: 'l3', description: 'Étrier' }),
        ]}
      />
    </QueryClientProvider>,
  );

describe('mécano : ancienne pièce en consigne', () => {
  beforeEach(() => {
    vi.mocked(fetchRepairOrderCores).mockResolvedValue({
      l1: core(),
      l3: core({ id: 'k3', ro_line_id: 'l3', status: 'returned' }),
    });
  });

  it('cocher, décocher ; consigne renvoyée non modifiable', async () => {
    renderSection();
    const items = await screen.findAllByRole('listitem');
    await waitFor(() =>
      expect(within(items[0]!).getByText('Garder l’ancienne pièce (consigne)')).toBeInTheDocument(),
    );
    expect(within(items[2]!).getByText('Ancienne pièce renvoyée au fournisseur')).toBeInTheDocument();
    expect(within(items[2]!).queryByRole('checkbox')).toBeNull();

    await userEvent.click(within(items[1]!).getByRole('checkbox', { name: 'Ancienne pièce en consigne' }));
    await waitFor(() => expect(addPartCore).toHaveBeenCalledWith('ro1', 'l2'));
    await userEvent.click(within(items[0]!).getByRole('checkbox', { name: 'Ancienne pièce en consigne' }));
    await waitFor(() => expect(deletePartCore).toHaveBeenCalledWith('k1'));
  });

  it('OR fermé : la consigne reste affichée, plus de case', async () => {
    renderSection(true);
    expect(await screen.findByText('Garder l’ancienne pièce (consigne)')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
