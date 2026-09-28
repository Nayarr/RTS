import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { fetchActiveTechnicians } from '@/features/repair-orders/api';
import type * as RepairOrdersApi from '@/features/repair-orders/api';
import { addDays } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  deleteClient,
  fetchClient,
  fetchClients,
  fetchDeadlines,
  fetchVehicle,
  updateClient,
  updateVehicle,
  type ClientDetail,
  type ClientOverview,
  type VehicleDetail,
  type VehicleOverview,
} from './api';
import type * as CustomersApi from './api';
import { ClientPage } from './ClientPage';
import { ClientsPage } from './ClientsPage';
import { DeadlinesPage } from './DeadlinesPage';
import {
  clientFromForm,
  clientToForm,
  deadlineStatus,
  mileageHistory,
  vehicleFromForm,
  vehicleToForm,
} from './domain';
import { maintenanceBookRows } from './maintenance-book-pdf';
import { VehiclePage } from './VehiclePage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof CustomersApi>()),
  fetchClients: vi.fn(),
  fetchClient: vi.fn(),
  fetchVehicle: vi.fn(),
  fetchDeadlines: vi.fn(),
  updateClient: vi.fn(),
  updateVehicle: vi.fn(),
  deleteClient: vi.fn(),
}));
vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RepairOrdersApi>()),
  fetchActiveTechnicians: vi.fn(),
}));
vi.mock('@/features/files/hooks', () => ({
  useUploadFile: () => ({ mutate: vi.fn(), isPending: false }),
  useFileUrls: () => ({ data: {}, isPending: false }),
  useFileUrl: () => ({ url: undefined, isPending: false, isError: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const client = (overrides: Partial<ClientOverview> = {}): ClientOverview =>
  ({
    id: 'c1',
    name: 'Transports Martin',
    email: 'compta@martin.fr',
    phone: null,
    billing_address: '1 rue du Port, 95190 Goussainville',
    siren: '123456789',
    discount_percent: null,
    hourly_rate: 85,
    notes: null,
    created_at: '2025-01-01T00:00:00Z',
    vehicles_count: 2,
    orders_count: 3,
    last_visit: '2026-09-20T08:00:00Z',
    revenue_ht: 1200,
    balance_due: 146.4,
    overdue_invoices_count: 1,
    ...overrides,
  }) as ClientOverview;

const vehicle = (overrides: Partial<VehicleOverview> = {}): VehicleOverview =>
  ({
    id: 'v1',
    plate: 'GH-512-RT',
    plate_key: 'GH512RT',
    vehicle_type: 'pl',
    client_id: 'c1',
    client_name: 'Transports Martin',
    brand: 'Renault Trucks',
    model: 'T 480',
    vin: null,
    first_registration_date: null,
    // Relatives à aujourd'hui : l'écran compte les jours depuis la date du jour
    ct_due_date: addDays(todayIso(), 12),
    tailgate_due_date: addDays(todayIso(), -8),
    registration_doc_file_id: null,
    notes: null,
    created_at: '2025-01-01T00:00:00Z',
    orders_count: 2,
    last_visit: '2026-09-20T08:00:00Z',
    last_mileage: 184320,
    ...overrides,
  }) as VehicleOverview;

const order = (overrides: Partial<RepairOrderOverview>) =>
  ({
    id: 'ro1',
    number: 'OR00001',
    status: 'invoiced',
    plate: 'GH-512-RT',
    vehicle_id: 'v1',
    requested_work: 'Vidange',
    mileage: 150000,
    created_at: '2025-09-20T08:00:00Z',
    ...overrides,
  }) as RepairOrderOverview;

const VEHICLE_DETAIL: VehicleDetail = {
  vehicle: vehicle(),
  orders: [
    order({
      id: 'ro2',
      number: 'OR00002',
      status: 'assigned',
      requested_work: 'Freinage',
      mileage: 184320,
      created_at: '2026-09-20T08:00:00Z',
    }),
    order({}),
  ],
  lines: [
    { repair_order_id: 'ro1', kind: 'done', line_type: 'labor', description: 'Vidange moteur\nhuile 10W40' },
    { repair_order_id: 'ro1', kind: 'done', line_type: 'part', description: 'Filtre à huile' },
  ],
  invoiceNumbers: { ro1: ['F11887'] },
};

const profile = (role: Profile['role']): Profile => ({
  id: 'p1',
  email: `${role}@test.fr`,
  full_name: role,
  role,
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

const renderAs = (role: Profile['role'], path: string, element: React.ReactNode, route: string) => {
  vi.mocked(fetchProfile).mockResolvedValue(profile(role));
  return renderRoutes(
    [
      { path: route, element },
      { path: '/clients', element: <p>Liste des clients</p> },
    ],
    { initialPath: path, auth: { session: fakeSession() } },
  );
};

beforeEach(() => {
  vi.mocked(updateClient).mockResolvedValue(undefined);
  vi.mocked(updateVehicle).mockResolvedValue(undefined);
  vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
});

// ---------------------------------------------------------------- Règles

describe('clients et véhicules : règles', () => {
  it('échéances : dépassée, dans les 30 jours, OK', () => {
    expect(deadlineStatus('2026-09-20', '2026-09-28')).toEqual({
      label: 'Dépassé (8 j)',
      tone: 'overdue',
      days: -8,
    });
    expect(deadlineStatus('2026-10-10', '2026-09-28')).toMatchObject({ label: 'Dans 12 j', tone: 'soon' });
    expect(deadlineStatus('2027-01-10', '2026-09-28')).toMatchObject({ label: 'OK', tone: 'ok' });
    expect(deadlineStatus(null, '2026-09-28')).toBeNull();
  });

  it('kilométrage : relevés dans l’ordre et moyenne annuelle', () => {
    const { points, perYear } = mileageHistory(VEHICLE_DETAIL.orders);
    expect(points.map((point) => point.mileage)).toEqual([150000, 184320]);
    expect(perYear).toBe(34344);
    expect(mileageHistory([order({ mileage: null })]).perYear).toBeNull();
  });

  it('fiche client : remise et taux horaire envoyés seulement par la direction', () => {
    const values = { ...clientToForm(client()), siren: '123 456 789', discount_percent: '5,5', phone: ' ' };
    expect(clientFromForm(values, false)).toEqual({
      name: 'Transports Martin',
      email: 'compta@martin.fr',
      phone: null,
      billing_address: '1 rue du Port, 95190 Goussainville',
      siren: '123456789',
      notes: null,
    });
    expect(clientFromForm(values, true)).toMatchObject({ discount_percent: 5.5, hourly_rate: 85 });
  });

  it('fiche véhicule : plaque mise en forme, VIN en majuscules, dates vides à null', () => {
    const values = { ...vehicleToForm(vehicle()), plate: 'gh512rt', vin: 'vf1abc', ct_due_date: '' };
    expect(vehicleFromForm(values)).toMatchObject({ plate: 'GH-512-RT', vin: 'VF1ABC', ct_due_date: null });
  });

  it('carnet d’entretien : un passage par ligne, du plus ancien au plus récent', () => {
    expect(maintenanceBookRows(VEHICLE_DETAIL)).toEqual([
      ['20/09/2025', 'OR00001', '150 000', 'Vidange moteur', 'Filtre à huile', 'F11887'],
      ['20/09/2026', 'OR00002', '184 320', 'Freinage', '—', '—'],
    ]);
  });
});

// ---------------------------------------------------------------- Écrans

describe('clients et véhicules : écrans', () => {
  it('liste des clients : recherche et filtre des impayés', async () => {
    vi.mocked(fetchClients).mockResolvedValue([
      client(),
      client({
        id: 'c2',
        name: 'Logistique Durand',
        balance_due: 0,
        overdue_invoices_count: 0,
        last_visit: null,
      }),
    ]);
    renderAs('reception', '/clients', <ClientsPage />, '/clients');
    const martin = await screen.findByRole('link', { name: /Transports Martin/ });
    expect(martin).toHaveAttribute('href', '/clients/c1');
    expect(martin).toHaveTextContent(/Impayés : 146,40\s€ TTC/);
    expect(martin).toHaveTextContent(/2 véhicules — 3 OR — CA HT : 1\s200,00\s€/);

    await userEvent.click(screen.getByRole('button', { name: 'Avec impayés 1' }));
    expect(screen.queryByRole('link', { name: /Logistique Durand/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tous 2' }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un client' }), 'durand');
    expect(screen.getByRole('link', { name: /Logistique Durand/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Transports Martin/ })).toBeNull();
  });

  const CLIENT_DETAIL: ClientDetail = {
    client: client(),
    vehicles: [vehicle()],
    orders: [
      order({ id: 'ro2', number: 'OR00002', status: 'work_done' }),
      order({ id: 'ro3', number: 'OR00003', status: 'to_invoice' }),
    ],
    invoices: [],
    quotes: [],
  };

  it('fiche client (réception) : coordonnées enregistrées sans les conditions commerciales', async () => {
    vi.mocked(fetchClient).mockResolvedValue(CLIENT_DETAIL);
    renderAs('reception', '/clients/c1', <ClientPage />, '/clients/:id');
    expect(await screen.findByRole('heading', { name: 'Transports Martin' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Reste dû : 146,40\s€ TTC — 1 facture en retard/);
    expect(screen.queryByLabelText('Remise client (%)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Facture groupée (2 OR)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
    expect(screen.getByRole('link', { name: /^GH-512-RT/ })).toHaveAttribute('href', '/vehicules/v1');

    await userEvent.type(screen.getByLabelText('Téléphone'), '0102030405');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateClient).toHaveBeenCalled());
    const patch = vi.mocked(updateClient).mock.calls[0]?.[1];
    expect(patch).toMatchObject({ phone: '0102030405' });
    expect(patch).not.toHaveProperty('hourly_rate');
    expect(patch).not.toHaveProperty('discount_percent');
  });

  it('fiche client (direction) : remise, taux horaire, suppression refusée si historique', async () => {
    vi.mocked(fetchClient).mockResolvedValue(CLIENT_DETAIL);
    vi.mocked(deleteClient).mockRejectedValue(
      new Error('Ce client a des OR, devis ou factures : il ne peut pas être supprimé'),
    );
    renderAs('direction', '/clients/c1', <ClientPage />, '/clients/:id');
    const rate = await screen.findByLabelText('Taux horaire client (€ HT)');
    expect(rate).toHaveValue('85');
    await userEvent.type(screen.getByLabelText('Remise client (%)'), '120');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Remise : 100 au maximum')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Remise client (%)'));
    await userEvent.type(screen.getByLabelText('Remise client (%)'), '5');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateClient).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({ discount_percent: 5, hourly_rate: 85 }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(deleteClient).toHaveBeenCalledWith('c1'));
    expect(screen.queryByText('Liste des clients')).toBeNull(); // on reste sur la fiche
  });

  it('fiche véhicule : échéances, historique, rendez-vous prérempli', async () => {
    vi.mocked(fetchVehicle).mockResolvedValue(VEHICLE_DETAIL);
    renderAs('reception', '/vehicules/v1', <VehiclePage />, '/vehicules/:id');
    expect(await screen.findByRole('heading', { name: 'GH-512-RT' })).toBeInTheDocument();
    expect(screen.getByText(/Dernier km : 184\s320 km/)).toBeInTheDocument();
    expect(screen.getByText('Dépassé (8 j)')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Kilométrage : de 150\s000 à 184\s320 km/ })).toBeInTheDocument();
    const history = screen.getByRole('region', { name: /Historique/ });
    expect(
      within(history)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/or/ro2', '/or/ro1']);
    expect(within(history).getByText('Vidange moteur • Filtre à huile')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Contrôle hayon'));
    const nextYear = addDays(todayIso(), 365);
    await userEvent.type(screen.getByLabelText('Contrôle hayon'), nextYear);
    expect(screen.getByText('OK')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateVehicle).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ tailgate_due_date: nextYear }),
      ),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Prendre rendez-vous' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau rendez-vous' });
    expect(within(dialog).getByLabelText('Immatriculation')).toHaveValue('GH-512-RT');
    expect(within(dialog).getByLabelText('Client')).toHaveValue('Transports Martin');
  });

  it('échéances des véhicules', async () => {
    vi.mocked(fetchDeadlines).mockResolvedValue([
      {
        vehicle_id: 'v1',
        plate: 'GH-512-RT',
        client_id: 'c1',
        client_name: 'Transports Martin',
        kind: 'tailgate',
        due_date: '2020-09-20',
        days_left: -8,
      },
    ]);
    renderAs('reception', '/vehicules/echeances', <DeadlinesPage />, '/vehicules/echeances');
    const item = await screen.findByRole('link', { name: /GH-512-RT/ });
    expect(item).toHaveAttribute('href', '/vehicules/v1');
    expect(item).toHaveTextContent('Contrôle hayon — 20/09/2020 — Transports Martin');
    expect(item).toHaveTextContent(/Dépassé/);
  });
});
