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
import { fetchFleet, type FleetVehicle } from '@/features/rentals/fleet-api';
import type * as FleetApi from '@/features/rentals/fleet-api';
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
  clientSchema,
  clientToForm,
  deadlineStatus,
  mileageHistory,
  otherPhones,
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
vi.mock('@/features/rentals/fleet-api', async (importOriginal) => ({
  ...(await importOriginal<typeof FleetApi>()),
  fetchFleet: vi.fn(),
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
    contact_name: null,
    phone: null,
    other_phones: [],
    billing_address: '1 rue du Port, 95190 Goussainville',
    siret: '12345678900015',
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
    // Hayon : mois seulement (1er du mois), ici il y a deux mois : dépassé
    tailgate_due_date: `${addDays(todayIso(), -62).slice(0, 7)}-01`,
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
  vi.mocked(fetchFleet).mockResolvedValue([]);
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
    const values = {
      ...clientToForm(client()),
      siret: '123 456 789 00015',
      discount_percent: '5,5',
      phone: ' ',
    };
    expect(clientFromForm(values, false)).toEqual({
      kind: 'pro',
      name: 'Transports Martin',
      civility: null,
      first_name: null,
      last_name: null,
      birth_date: null,
      birth_place: null,
      email: 'compta@martin.fr',
      contact_name: null,
      phone: null,
      other_phones: [],
      billing_address: '1 rue du Port, 95190 Goussainville',
      siret: '12345678900015',
      notes: null,
    });
    expect(clientFromForm(values, true)).toMatchObject({ discount_percent: 5.5, hourly_rate: 85 });
  });

  it('fiche client : autres numéros lus et enregistrés avec leur libellé', () => {
    expect(
      otherPhones([{ label: 'Comptabilité', phone: '01 23 45 67 89' }, { phone: 'sans libellé' }, null]),
    ).toEqual([{ label: 'Comptabilité', phone: '01 23 45 67 89' }]);
    expect(otherPhones(null)).toEqual([]);
    const values = {
      ...clientToForm(client({ other_phones: [{ label: 'Comptabilité', phone: '01 23 45 67 89' }] })),
      contact_name: ' M. Martin ',
      other_phones: [{ label: ' Chef d’atelier ', phone: ' 06 11 22 33 44 ' }],
    };
    expect(clientFromForm(values, false)).toMatchObject({
      contact_name: 'M. Martin',
      other_phones: [{ label: 'Chef d’atelier', phone: '06 11 22 33 44' }],
    });
    const missing = clientSchema.safeParse({ ...values, other_phones: [{ label: '', phone: '06' }] });
    expect(missing.success).toBe(false);
  });

  it('fiche véhicule : plaque mise en forme, VIN en majuscules, dates vides à null', () => {
    const values = { ...vehicleToForm(vehicle()), plate: 'gh512rt', vin: 'vf1abc', ct_due_date: '' };
    expect(vehicleFromForm(values)).toMatchObject({ plate: 'GH-512-RT', vin: 'VF1ABC', ct_due_date: null });
  });

  it('carnet d’entretien : un passage par ligne, du plus ancien au plus récent', () => {
    expect(maintenanceBookRows(VEHICLE_DETAIL)).toEqual([
      ['20/09/2025', 'OR00001', '150 000', 'Vidange moteur', 'Filtre à huile', 'F11887'],
      ['20/09/2026', 'OR00002', '184 320', 'Freinage', '-', '-'],
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
        other_phones: [{ label: 'Comptabilité', phone: '01 33 44 55 66' }],
        balance_due: 0,
        overdue_invoices_count: 0,
        last_visit: null,
      }),
    ]);
    renderAs('reception', '/clients', <ClientsPage />, '/clients');
    const martin = await screen.findByRole('row', { name: /Transports Martin/ });
    expect(within(martin).getAllByRole('link')[0]).toHaveAttribute('href', '/clients/c1');
    expect(martin).toHaveTextContent(/2\s*3\s*1\s200,00\s€.*146,40\s€/);

    await userEvent.click(screen.getByRole('button', { name: 'Avec impayés 1' }));
    expect(screen.queryByRole('row', { name: /Logistique Durand/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Tous 2' }));
    const search = screen.getByRole('searchbox', { name: 'Rechercher un client' });
    await userEvent.type(search, 'durand');
    expect(screen.getByRole('row', { name: /Logistique Durand/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Transports Martin/ })).toBeNull();
    // Un autre numéro, tapé sans espaces, retrouve le client
    await userEvent.clear(search);
    await userEvent.type(search, '0133445566');
    expect(screen.getByRole('row', { name: /Logistique Durand/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /Transports Martin/ })).toBeNull();
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
    expect(await screen.findByRole('heading', { name: /Transports Martin/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/146,40\s€Impayés TTC · 1 facture en retard/);
    expect(screen.queryByLabelText('Remise client (%)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Facture groupée (2 OR)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
    expect(screen.getByRole('link', { name: /^GH-512-RT/ })).toHaveAttribute('href', '/vehicules/v1');

    await userEvent.type(screen.getByLabelText('Contact de référence'), 'Paul Martin');
    await userEvent.type(screen.getByLabelText('Téléphone du contact'), '0102030405');
    // Autres numéros : libellé obligatoire
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un numéro' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un numéro' }));
    const first = screen.getByRole('group', { name: 'Autre numéro 1' });
    await userEvent.type(within(first).getByLabelText('Numéro'), '01 99 88 77 66');
    await userEvent.click(screen.getByRole('button', { name: 'Retirer l’autre numéro 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await within(first).findByText('Indique à qui est ce numéro')).toBeInTheDocument();
    expect(updateClient).not.toHaveBeenCalled();

    await userEvent.type(within(first).getByLabelText('Libellé'), 'Comptabilité');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateClient).toHaveBeenCalled());
    const patch = vi.mocked(updateClient).mock.calls[0]?.[1];
    expect(patch).toMatchObject({
      contact_name: 'Paul Martin',
      phone: '0102030405',
      other_phones: [{ label: 'Comptabilité', phone: '01 99 88 77 66' }],
    });
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
    expect(await screen.findByRole('heading', { name: /GH-512-RT/ })).toBeInTheDocument();
    expect(screen.getByText(/Dernier km : 184\s320 km/)).toBeInTheDocument();
    expect(screen.getByText(/^Dépassé \(\d+ j\)$/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Kilométrage : de 150\s000 à 184\s320 km/ })).toBeInTheDocument();
    const history = screen.getByRole('region', { name: /Historique/ });
    expect(
      within(history)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/or/ro2', '/or/ro1']);
    expect(within(history).getByText('Vidange moteur · Filtre à huile')).toBeInTheDocument();

    // Hayon : mois et année l'an prochain
    const nextYear = String(new Date().getFullYear() + 1);
    await userEvent.selectOptions(screen.getByLabelText('Contrôle hayon : mois'), '06');
    await userEvent.selectOptions(screen.getByLabelText('Contrôle hayon : année'), nextYear);
    expect(screen.getByText('OK')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateVehicle).toHaveBeenCalledWith(
        'v1',
        expect.objectContaining({ tailgate_due_date: `${nextYear}-06-01` }),
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
        // Hayon : la vue donne la fin du mois d'échéance
        due_date: '2020-09-30',
        days_left: -8,
      },
    ]);
    renderAs('reception', '/vehicules/echeances', <DeadlinesPage />, '/vehicules/echeances');
    const item = await screen.findByRole('row', { name: /GH-512-RT/ });
    expect(within(item).getByRole('link', { name: 'GH-512-RT' })).toHaveAttribute('href', '/vehicules/v1');
    expect(item).toHaveTextContent('Contrôle hayon09/2020Transports Martin');
    expect(item).toHaveTextContent(/Dépassé/);
  });

  it('échéances de la flotte de location : assurance expirée (bloqué), vidange proche', async () => {
    vi.mocked(fetchDeadlines).mockResolvedValue([]);
    const fleetVehicle = (overrides: Partial<FleetVehicle>) =>
      ({
        id: 'f1',
        plate: 'GA-552-TR',
        brand: 'Krone',
        model: 'Profi Liner',
        category: 'trailer',
        mileage: null,
        next_service_km: null,
        ct_due_date: null,
        insurance_due_date: null,
        in_maintenance: false,
        is_active: true,
        ...overrides,
      }) as FleetVehicle;
    vi.mocked(fetchFleet).mockResolvedValue([
      fleetVehicle({ insurance_due_date: addDays(todayIso(), -5) }),
      fleetVehicle({
        id: 'f2',
        plate: 'GE-781-UV',
        brand: 'Renault',
        model: 'Master',
        category: 'van',
        mileage: 48_210,
        next_service_km: 50_000,
      }),
      fleetVehicle({ id: 'f3', plate: 'XX-000-XX', insurance_due_date: '2020-01-01', is_active: false }),
    ]);
    renderAs('reception', '/vehicules/echeances', <DeadlinesPage />, '/vehicules/echeances');
    await userEvent.click(await screen.findByRole('button', { name: /Flotte de location 2/ }));
    const table = await screen.findByRole('table', { name: 'Échéances de la flotte' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    const [insurance, service] = rows as [HTMLElement, HTMLElement];
    expect(insurance).toHaveTextContent(/GA-552-TRKrone Profi LinerAssurance.*Expirée depuis 5 joursBloqué/);
    expect(within(insurance).getByRole('link', { name: /Ajouter l’attestation/ })).toHaveAttribute(
      'href',
      '/location/flotte/f1',
    );
    expect(service).toHaveTextContent(/GE-781-UV.*Vidange.*50.000 km.*Dans 1.790 km.*Disponible/);

    await userEvent.click(within(service).getByRole('button', { name: /Prendre rendez-vous/ }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau rendez-vous' });
    expect(within(dialog).getByLabelText('Immatriculation')).toHaveValue('GE-781-UV');
  });
});
