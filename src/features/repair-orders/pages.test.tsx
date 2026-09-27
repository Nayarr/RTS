import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  createRepairOrder,
  deleteRepairOrder,
  fetchActiveTechnicians,
  fetchRepairOrder,
  fetchRepairOrderEvents,
  fetchRepairOrders,
  findVehicleByPlate,
  updateRepairOrder,
  type RepairOrderOverview,
} from './api';
import type * as RoApi from './api';
import { NewRepairOrderPage } from './NewRepairOrderPage';
import { RepairOrderPage } from './RepairOrderPage';
import { RepairOrdersPage } from './RepairOrdersPage';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof RoApi>()),
  fetchRepairOrders: vi.fn(),
  fetchRepairOrder: vi.fn(),
  fetchRepairOrderEvents: vi.fn(),
  fetchActiveTechnicians: vi.fn(),
  findVehicleByPlate: vi.fn(),
  searchClients: vi.fn().mockResolvedValue([]),
  createRepairOrder: vi.fn(),
  updateRepairOrder: vi.fn(),
  deleteRepairOrder: vi.fn(),
}));
vi.mock('./supplies-api', () => ({
  fetchSupplies: vi.fn().mockResolvedValue({ subcontracts: [], consumables: [], partSuppliers: {} }),
}));
vi.mock('@/features/files/hooks', () => ({
  useFileUrl: () => ({ url: undefined, isPending: false, isError: false }),
  useFileUrls: () => ({ data: {}, isPending: false }),
}));
vi.mock('@/features/quotes/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRepairOrderQuotes: vi.fn().mockResolvedValue([]),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const order = (overrides: Partial<RepairOrderOverview> = {}): RepairOrderOverview =>
  ({
    id: 'ro1',
    number: 'OR00001',
    status: 'assigned',
    vehicle_id: 'v1',
    vehicle_type: 'pl',
    plate: 'GH-512-RT',
    plate_key: 'GH512RT',
    client_name: 'Transports Martin',
    requested_work: 'Bruit au freinage',
    technician_id: 't1',
    technician_name: 'Alice',
    technician_color: '#2A6B52',
    created_at: '2026-09-27T10:00:00Z',
    worked_seconds: 0,
    running_since: null,
    declared_hours: 0,
    missing_photo_labels: ['Face avant'],
    parts_pending_count: 0,
    mileage: 184320,
    customer_signature_file_id: null,
    planned_date: null,
    planned_start: null,
    planned_end: null,
    ...overrides,
  }) as RepairOrderOverview;

const asRole = (role: Profile['role']) =>
  vi.mocked(fetchProfile).mockResolvedValue({
    id: '00000000-0000-0000-0000-0000000000d1',
    email: 'bureau@test.fr',
    full_name: 'Bureau',
    role,
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });

const render = (path: string) =>
  renderRoutes(
    [
      { path: '/or', element: <RepairOrdersPage /> },
      { path: '/or/nouveau', element: <NewRepairOrderPage /> },
      { path: '/or/:id', element: <RepairOrderPage /> },
    ],
    { initialPath: path, auth: { session: fakeSession() } },
  );

describe('liste des OR', () => {
  it('masque les OR facturés par défaut, filtre et recherche', async () => {
    vi.mocked(fetchRepairOrders).mockResolvedValue([
      order(),
      order({ id: 'ro2', number: 'OR00002', plate: 'AB-123-CD', plate_key: 'AB123CD', status: 'invoiced' }),
      order({
        id: 'ro3',
        number: 'OR00003',
        plate: 'EF-456-GH',
        plate_key: 'EF456GH',
        client_name: 'Dupont',
      }),
    ]);
    render('/or');

    expect(await screen.findByText('GH-512-RT')).toBeInTheDocument();
    expect(screen.queryByText('AB-123-CD')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Facturé/ }));
    expect(screen.getByText('AB-123-CD')).toBeInTheDocument();
    expect(screen.queryByText('GH-512-RT')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Tous/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un OR' }), 'ef 456');
    expect(screen.getByText('EF-456-GH')).toBeInTheDocument();
    expect(screen.queryByText('GH-512-RT')).not.toBeInTheDocument();
  });
});

describe('nouvel OR', () => {
  it('crée l’OR puis ouvre sa fiche', async () => {
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([{ id: 't1', display_name: 'Alice', color: null }]);
    vi.mocked(findVehicleByPlate).mockResolvedValue(null);
    vi.mocked(createRepairOrder).mockResolvedValue({ id: 'ro9', number: 'OR00009' } as never);
    vi.mocked(fetchRepairOrder).mockResolvedValue(null);
    render('/or/nouveau');

    await userEvent.type(await screen.findByLabelText('Immatriculation'), 'gh512rt');
    expect(screen.getByLabelText('Immatriculation')).toHaveValue('GH-512-RT');
    await userEvent.type(screen.getByLabelText('Client'), 'Transports Martin');
    await userEvent.type(screen.getByLabelText('Tâche à faire'), 'Freins');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’OR' }));

    await waitFor(() => expect(createRepairOrder).toHaveBeenCalledOnce());
    expect(vi.mocked(createRepairOrder).mock.calls[0]?.[0]).toMatchObject({
      plate: 'GH-512-RT',
      client_name: 'Transports Martin',
      requested_work: 'Freins',
      signature_file_id: null,
    });
    expect(await screen.findByText('OR introuvable')).toBeInTheDocument(); // fiche ouverte (/or/ro9)
  });

  it('demande confirmation si un OR non facturé existe déjà pour le véhicule', async () => {
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
    vi.mocked(findVehicleByPlate).mockResolvedValue({
      id: 'v1',
      plate: 'GH-512-RT',
      vehicle_type: 'vul',
      client_name: 'Transports Martin',
      open_orders: [{ id: 'ro1', number: 'OR00001', status: 'in_progress' }],
    });
    render('/or/nouveau');

    await userEvent.type(await screen.findByLabelText('Immatriculation'), 'GH512RT');
    expect(await screen.findByText(/OR00001 \(En cours\)/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Client')).toHaveValue('Transports Martin'));

    await userEvent.type(screen.getByLabelText('Tâche à faire'), 'Pneus');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’OR' }));
    const dialog = await screen.findByRole('dialog', { name: 'Créer un autre OR pour ce véhicule ?' });
    expect(createRepairOrder).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Créer quand même' }));
    await waitFor(() => expect(createRepairOrder).toHaveBeenCalledOnce());
    expect(vi.mocked(createRepairOrder).mock.calls[0]?.[0]).toMatchObject({ vehicle_type: 'vul' });
  });
});

describe('fiche OR', () => {
  const detail = (overrides: Partial<RepairOrderOverview> = {}) =>
    vi.mocked(fetchRepairOrder).mockResolvedValue({
      order: order(overrides),
      lines: [],
      photos: [],
      inspection: null,
      timeEntries: [],
    });

  it('réception : informations, historique, pas de pilotage direction', async () => {
    asRole('reception');
    detail();
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([{ id: 't1', display_name: 'Alice', color: null }]);
    vi.mocked(fetchRepairOrderEvents).mockResolvedValue([
      {
        id: 'e1',
        repair_order_id: 'ro1',
        label: 'OR créé : OR00001',
        actor_id: null,
        actor_name: 'Réception',
        created_at: '2026-09-27T10:00:00Z',
      },
    ]);
    render('/or/ro1');

    expect(await screen.findByRole('heading', { name: 'GH-512-RT' })).toBeInTheDocument();
    expect(screen.getByText('Aucune signature client enregistrée.')).toBeInTheDocument();
    expect(await screen.findByText('OR créé : OR00001')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pilotage (direction)' })).not.toBeInTheDocument();
    expect(screen.queryByText('Déclaré (travaux effectués)')).not.toBeInTheDocument();
  });

  it('travaux terminés : validation vers « Facture à faire »', async () => {
    asRole('direction');
    detail({ status: 'work_done' });
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
    vi.mocked(fetchRepairOrderEvents).mockResolvedValue([]);
    vi.mocked(updateRepairOrder).mockResolvedValue();
    render('/or/ro1');

    await userEvent.click(await screen.findByRole('button', { name: /Valider → Facture à faire/ }));
    await waitFor(() => expect(updateRepairOrder).toHaveBeenCalledWith('ro1', { status: 'to_invoice' }));
    expect(screen.getByRole('heading', { name: 'Pilotage (direction)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Débloquer pour le technicien/ })).toBeInTheDocument();
  });

  it('la direction supprime l’OR et revient à la liste', async () => {
    asRole('direction');
    detail();
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
    vi.mocked(fetchRepairOrderEvents).mockResolvedValue([]);
    vi.mocked(fetchRepairOrders).mockResolvedValue([]);
    vi.mocked(deleteRepairOrder).mockImplementation(() => {
      vi.mocked(fetchRepairOrder).mockResolvedValue(null); // la fiche n'existe plus
      return Promise.resolve();
    });
    render('/or/ro1');

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer cet OR/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Supprimer OR00001 ?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));

    expect(await screen.findByRole('heading', { name: 'Ordres de réparation' })).toBeInTheDocument();
    expect(deleteRepairOrder).toHaveBeenCalledWith('ro1');
  });

  it('n’envoie que les informations modifiées', async () => {
    asRole('reception');
    detail();
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
    vi.mocked(fetchRepairOrderEvents).mockResolvedValue([]);
    vi.mocked(updateRepairOrder).mockResolvedValue();
    render('/or/ro1');

    const mileage = await screen.findByLabelText('Kilométrage');
    await userEvent.clear(mileage);
    await userEvent.type(mileage, '185000');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateRepairOrder).toHaveBeenCalledWith('ro1', { mileage: 185000 }));
  });
});
