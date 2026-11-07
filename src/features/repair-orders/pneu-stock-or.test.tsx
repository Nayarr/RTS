import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { fetchPart, saveCatalogPart, type Part } from '@/features/catalogs/api';
import type * as CatalogApi from '@/features/catalogs/api';
import type * as WarrantiesApi from '@/features/warranties/api';
import { fetchInspection, fetchLotsForSize, type TireLot } from '@/features/tires/api';
import type * as TiresApi from '@/features/tires/api';
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
import {
  addPartLine,
  addStockTireLine,
  updatePartLine,
  fetchSupplies,
  type RepairOrderSupplies,
} from './supplies-api';
import type * as SuppliesApi from './supplies-api';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/catalogs/api', async (importOriginal) => ({
  ...(await importOriginal<typeof CatalogApi>()),
  fetchParts: vi.fn(),
  fetchPart: vi.fn(),
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
  addStockTireLine: vi.fn(),
  updatePartLine: vi.fn(),
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
vi.mock('@/features/tires/api', async (importOriginal) => ({
  ...(await importOriginal<typeof TiresApi>()),
  fetchInspection: vi.fn(),
  fetchLotsForSize: vi.fn(),
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

const catalogPart: Part = {
  oem_key: null,
  manufacturer_key: null,
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

const tireLot: TireLot = {
  id: 't1',
  line_id: 'tl1',
  category: 'pl',
  size: '315/80 R22.5',
  profile: 'avant',
  brand_id: 'b1',
  brand_name: 'Michelin',
  model: 'X Multi Z',
  condition: 'neuf',
  load_index: null,
  location: 'Rack A1',
  dot: null,
  supplier_id: 's1',
  supplier_name: 'Euromaster',
  purchase_price: 312,
  sale_price: 415,
  stock_qty: 8,
  reserved_qty: 0,
  available_qty: 8,
  sold_90d: 0,
  part_id: 'tp1',
};

describe('fiche OR : pneu du stock', () => {
  it('pneu choisi dans le stock du module Pneumatiques : ligne de la pièce du lot', async () => {
    vi.mocked(fetchInspection).mockResolvedValue({
      pneus: { avant_etat: 'HS', avant_taille: '315/80/22.5' },
    });
    vi.mocked(fetchLotsForSize).mockResolvedValue([tireLot]);
    vi.mocked(addStockTireLine).mockResolvedValue();
    setup();

    await userEvent.click(await screen.findByRole('button', { name: 'Pneu du stock' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pneus avant (HS) · 315/80 R22.5' });
    expect(fetchLotsForSize).toHaveBeenCalledWith('31580225', 'pl');
    expect(await within(dialog).findByRole('radio', { name: 'Michelin X Multi Z' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(within(dialog).getByText(/sont réservés pour cet OR/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: /Ajouter à l’OR/ }));

    await waitFor(() =>
      expect(addStockTireLine).toHaveBeenCalledWith('ro1', 1, {
        line_type: 'part',
        description: 'Pneu Michelin X Multi Z 315/80 R22.5',
        quantity: 2,
        unit_price: 415,
        purchase_price: 312,
        brand: 'Michelin',
        supplier_id: 's1',
        part_id: 'tp1',
      }),
    );
    expect(addPartLine).not.toHaveBeenCalled();
  });

  it('ligne de pneu du stock modifiée : reste liée au lot (pas une pièce du catalogue)', async () => {
    vi.mocked(fetchPart).mockResolvedValue({ ...catalogPart, id: 'tp1', is_tire: true });
    vi.mocked(updatePartLine).mockResolvedValue();
    vi.mocked(saveCatalogPart).mockClear();
    const tireLine = {
      ...partLine,
      id: 'l2',
      description: 'Pneu Michelin X Multi Z 315/80 R22.5',
      unit_price: 415,
      purchase_price: 312,
      brand: 'Michelin',
      part_id: 'tp1',
      order_status: 'received',
    } as RoLine;
    setup({ lines: [tireLine], overrides: { parts_pending_count: 0 } });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Modifier Pneu Michelin X Multi Z 315/80 R22.5' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Modifier la pièce' });
    const quantity = within(dialog).getByLabelText('Quantité');
    await userEvent.clear(quantity);
    await userEvent.type(quantity, '4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(updatePartLine).toHaveBeenCalledWith(
        'l2',
        expect.objectContaining({ part_id: 'tp1', quantity: 4, order_status: 'received' }),
      ),
    );
    expect(saveCatalogPart).not.toHaveBeenCalled();
  });
});
