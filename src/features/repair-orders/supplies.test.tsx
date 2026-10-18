import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import {
  fetchConsumables,
  fetchParts,
  saveCatalogPart,
  type Consumable,
  type Part,
} from '@/features/catalogs/api';
import type * as CatalogApi from '@/features/catalogs/api';
import { saveWarrantyClaim } from '@/features/warranties/api';
import type * as WarrantiesApi from '@/features/warranties/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  fetchActiveTechnicians,
  fetchRepairOrder,
  fetchRepairOrderEvents,
  type RepairOrderOverview,
  type RoLine,
} from './api';
import type * as RoApi from './api';
import { RepairOrderPage } from './RepairOrderPage';
import { isLateSubcontract, resalePrice, subcontractFromForm, subcontractToForm } from './supplies';
import {
  addPartLine,
  addRoConsumable,
  fetchSupplies,
  saveSubcontract,
  setPartOrderStatus,
  type RepairOrderSupplies,
  type Subcontract,
} from './supplies-api';
import type * as SuppliesApi from './supplies-api';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/catalogs/api', async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogApi>()),
  fetchParts: vi.fn(),
  fetchConsumables: vi.fn(),
  saveCatalogPart: vi.fn().mockResolvedValue('p1'),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof RoApi>()),
  fetchRepairOrder: vi.fn(),
  fetchRepairOrderEvents: vi.fn().mockResolvedValue([]),
  fetchActiveTechnicians: vi.fn(),
}));
vi.mock('./supplies-api', async (importOriginal) => ({
  ...(await importOriginal<typeof SuppliesApi>()),
  fetchSupplies: vi.fn(),
  addPartLine: vi.fn(),
  setPartOrderStatus: vi.fn(),
  saveSubcontract: vi.fn(),
  addRoConsumable: vi.fn(),
}));
vi.mock('@/features/files/hooks', () => ({
  useFileUrl: () => ({ url: undefined, isPending: false, isError: false }),
  useFileUrls: () => ({ data: {}, isPending: false }),
}));
vi.mock('@/features/invoices/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRepairOrderInvoices: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/quotes/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRepairOrderQuotes: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/features/warranties/api', async (importOriginal) => ({
  ...(await importOriginal<typeof WarrantiesApi>()),
  saveWarrantyClaim: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const order = (overrides: Partial<RepairOrderOverview> = {}) =>
  ({
    id: 'ro1',
    number: 'OR00001',
    status: 'in_progress',
    vehicle_id: 'v1',
    vehicle_type: 'pl',
    plate: 'GH-512-RT',
    client_name: 'Transports Martin',
    requested_work: 'Bruit au freinage',
    technician_id: null,
    created_at: '2026-09-27T10:00:00Z',
    worked_seconds: 0,
    running_since: null,
    declared_hours: 0,
    missing_photo_labels: [],
    parts_pending_count: 1,
    mileage: null,
    customer_signature_file_id: null,
    planned_date: null,
    planned_start: null,
    planned_end: null,
    ...overrides,
  }) as RepairOrderOverview;

const partLine = {
  id: 'l1',
  repair_order_id: 'ro1',
  kind: 'done',
  line_type: 'part',
  position: 0,
  description: 'Plaquettes avant',
  quantity: 2,
  unit_price: 69,
  purchase_price: 46,
  order_status: 'to_order',
  brand: 'Knorr-Bremse',
  manufacturer_ref: null,
  oem_ref: null,
} as RoLine;

const subcontract = (overrides: Partial<Subcontract> = {}): Subcontract =>
  ({
    id: 's1',
    repair_order_id: 'ro1',
    service: 'Rectification disques',
    supplier_id: 'sp1',
    supplier_name: 'Rectif Service',
    cost_ht: 100,
    margin_percent: 25,
    resale_price_ht: 125,
    sent_on: '2026-09-20',
    expected_return_on: '2026-09-25',
    status: 'sent',
    returned_on: null,
    ...overrides,
  }) as Subcontract;

const catalogPart: Part = {
  id: 'p1',
  designation: 'Filtre à huile',
  brand: 'Mann-Filter',
  manufacturer_ref: 'HU 12 140 x',
  oem_ref: null,
  vehicle_ref: null,
  shipping_cost: null,
  margin_kind: 'percent',
  margin_value: null,
  supplier_id: 'sp2',
  supplier_name: 'PL Pièces 95',
  purchase_price: 21.5,
  sale_price: 32,
  is_active: true,
  is_tire: false,
  legacy_id: null,
  created_at: '2026-09-27T08:00:00Z',
  updated_at: '2026-09-27T08:00:00Z',
};

const oil = {
  id: 'c1',
  name: 'Huile 10W40',
  unit: 'L',
  sale_price: 6.5,
  purchase_price: 3.2,
  stock_qty: 208,
} as Consumable;

function setup({
  overrides = {},
  lines = [partLine],
  supplies = {},
}: {
  overrides?: Partial<RepairOrderOverview>;
  lines?: RoLine[];
  supplies?: Partial<RepairOrderSupplies>;
} = {}) {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: 'u1',
    email: 'reception@test.fr',
    full_name: 'Réception',
    role: 'reception',
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
  vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
  vi.mocked(fetchRepairOrderEvents).mockResolvedValue([]);
  vi.mocked(fetchRepairOrder).mockResolvedValue({
    order: order(overrides),
    lines,
    photos: [],
    inspection: null,
    timeEntries: [],
  });
  vi.mocked(fetchSupplies).mockResolvedValue({
    subcontracts: [],
    consumables: [],
    partSuppliers: { l1: 'PL Pièces 95' },
    ...supplies,
  });
  return renderRoutes([{ path: '/or/:id', element: <RepairOrderPage /> }], {
    initialPath: '/or/ro1',
    auth: { session: fakeSession() },
  });
}

const card = async (title: string) =>
  (await screen.findByRole('heading', { name: title })).closest<HTMLElement>('[data-slot="card"]')!;

describe('règles', () => {
  it('prix de revente de la sous-traitance, arrondi comme la base', () => {
    expect(resalePrice(100, 25)).toBe(125);
    expect(resalePrice(33.33, 20)).toBe(40);
    expect(resalePrice(null, 20)).toBeNull();
  });

  it('retard : chez le prestataire après la date de retour prévue', () => {
    expect(isLateSubcontract(subcontract(), '2026-09-27')).toBe(true);
    expect(isLateSubcontract(subcontract(), '2026-09-25')).toBe(false);
    expect(isLateSubcontract(subcontract({ status: 'returned' }), '2026-09-27')).toBe(false);
  });

  it('date de retour posée au retour du travail, conservée ensuite', () => {
    const values = { ...subcontractToForm(subcontract()), status: 'returned' as const };
    expect(subcontractFromForm(values, subcontract()).returned_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(subcontractFromForm(values, subcontract({ returned_on: '2026-09-24' })).returned_on).toBe(
      '2026-09-24',
    );
    expect(subcontractFromForm({ ...values, status: 'sent' }, subcontract()).returned_on).toBeNull();
  });
});

describe('fiche OR : pièces', () => {
  it('affiche la pièce, son fournisseur, le total et l’attente pièces', async () => {
    setup();
    const parts = await card('Pièces');
    expect(within(parts).getByText('Plaquettes avant')).toBeInTheDocument();
    expect(within(parts).getByText(/PL Pièces 95/)).toBeInTheDocument();
    expect(within(parts).getByText(/Total pièces/)).toHaveTextContent('138,00 € HT');
    expect(screen.getByText(/Attente pièces \(1\)/)).toBeInTheDocument();
    // Les pièces ne sont pas répétées dans les travaux
    expect(within(await card('Intervention atelier')).queryByText('Plaquettes avant')).toBeNull();
  });

  it('suivi de commande', async () => {
    vi.mocked(setPartOrderStatus).mockResolvedValue();
    setup();
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Commande : Plaquettes avant' }),
      'ordered',
    );
    expect(setPartOrderStatus).toHaveBeenCalledWith('l1', 'ordered');
  });

  it('ajout depuis le catalogue : champs repris, quantité modifiable', async () => {
    vi.mocked(fetchParts).mockResolvedValue([catalogPart]);
    vi.mocked(addPartLine).mockResolvedValue();
    setup({ lines: [partLine, { ...partLine, id: 'l0', line_type: 'labor', position: 3 }] });

    await userEvent.click(await screen.findByRole('button', { name: /Ajouter une pièce/ }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une pièce' });
    // Pièces de la base proposées pendant la saisie de la désignation
    await userEvent.type(within(dialog).getByLabelText('Désignation'), 'filtre');
    const suggestions = await within(dialog).findByRole('list', { name: 'Pièces de la base' });
    await userEvent.click(within(suggestions).getByRole('button', { name: /Filtre à huile/ }));
    expect(within(dialog).getByLabelText('Désignation')).toHaveValue('Filtre à huile');
    // (32 - 21,50) / 21,50 = 48,84 % ; total de la ligne avec la quantité
    expect(within(dialog).getByLabelText('Marge (%)')).toHaveValue('48,84');
    const quantity = within(dialog).getByLabelText('Quantité');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '2');
    expect(within(dialog).getByLabelText('Total HT de la ligne')).toHaveTextContent('64,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(addPartLine).toHaveBeenCalledWith('ro1', 4, {
        description: 'Filtre à huile',
        quantity: 2,
        unit_price: 32,
        purchase_price: 21.5,
        shipping_cost: null,
        supplier_name: 'PL Pièces 95',
        brand: 'Mann-Filter',
        manufacturer_ref: 'HU 12 140 x',
        oem_ref: null,
        part_id: 'p1',
        order_status: 'to_order',
      }),
    );
    expect(saveCatalogPart).toHaveBeenCalledWith(
      expect.objectContaining({
        designation: 'Filtre à huile',
        manufacturer_ref: 'HU 12 140 x',
        sale_price: 32,
      }),
    );
  });

  it('retour d’une pièce au fournisseur, même sur un OR facturé', async () => {
    vi.mocked(saveWarrantyClaim).mockResolvedValue();
    setup({ overrides: { status: 'invoiced' }, lines: [{ ...partLine, manufacturer_ref: 'K1234' }] });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Déclarer un retour : Plaquettes avant' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Nouveau retour / garantie' });
    await userEvent.type(within(dialog).getByLabelText('Motif du retour'), 'Défaut');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveWarrantyClaim).toHaveBeenCalledWith(
        null,
        {
          part_name: 'Plaquettes avant',
          brand: 'Knorr-Bremse',
          supplier_name: 'PL Pièces 95',
          reference: 'K1234',
          amount_ht: 46,
          reason: 'Défaut',
          status: 'to_return',
          notes: null,
        },
        'l1',
      ),
    );
  });

  it('OR facturé : consultation seulement', async () => {
    setup({
      overrides: { status: 'invoiced' },
      supplies: { subcontracts: [subcontract({ status: 'returned' })] },
    });
    expect(await screen.findByRole('combobox', { name: 'Commande : Plaquettes avant' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Ajouter une pièce/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Confier un travail/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ajouter huile/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Rectification disques/ })).toBeDisabled();
  });
});

describe('fiche OR : sous-traitance et consommables', () => {
  it('sous-traitance en retard, puis confiée avec calcul du prix refacturé', async () => {
    vi.mocked(saveSubcontract).mockResolvedValue();
    setup({ supplies: { subcontracts: [subcontract()] } });
    const block = await card('Sous-traitance');
    expect(within(block).getByText('En retard')).toBeInTheDocument();

    await userEvent.click(within(block).getByRole('button', { name: /Confier un travail/ }));
    const dialog = screen.getByRole('dialog', { name: 'Sous-traitance' });
    await userEvent.type(within(dialog).getByLabelText('Prestation'), 'Géométrie');
    await userEvent.type(within(dialog).getByLabelText('Prestataire'), 'Garage Géo');
    await userEvent.type(within(dialog).getByLabelText('Coût HT (€)'), '80');
    expect(within(dialog).getByText(/Refacturé :/)).toHaveTextContent('96,00 € HT');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveSubcontract).toHaveBeenCalledWith(
        'ro1',
        null,
        expect.objectContaining({
          service: 'Géométrie',
          supplier_name: 'Garage Géo',
          cost_ht: 80,
          margin_percent: 20,
          status: 'sent',
        }),
      ),
    );
  });

  it('consommable : produit, quantité à virgule, stock affiché', async () => {
    vi.mocked(fetchConsumables).mockResolvedValue([oil]);
    vi.mocked(addRoConsumable).mockResolvedValue();
    setup();
    await userEvent.click(await screen.findByRole('button', { name: /Ajouter huile/ }));
    const dialog = screen.getByRole('dialog', { name: 'Consommable utilisé' });
    const product = within(dialog).getByLabelText('Produit');
    await within(dialog).findByRole('option', { name: 'Huile 10W40 (208 L en stock)' });
    await userEvent.selectOptions(product, 'c1');
    await userEvent.type(within(dialog).getByLabelText('Quantité'), '32,5');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(addRoConsumable).toHaveBeenCalledWith('ro1', oil, 32.5));
  });
});
