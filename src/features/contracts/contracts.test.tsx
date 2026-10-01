import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveAppointment } from '@/features/planning/api';
import type * as PlanningApi from '@/features/planning/api';
import { addDays } from '@/features/planning/domain';
import { fetchActiveTechnicians } from '@/features/repair-orders/api';
import type * as RepairOrdersApi from '@/features/repair-orders/api';
import { todayIso } from '@/features/repair-orders/schemas';
import { renderRoutes } from '@/test/render';
import { buildContractInvoice, endContract, fetchContracts, saveContract, type Contract } from './api';
import type * as ContractsApi from './api';
import { ContractsPage } from './ContractsPage';
import { contractFromForm, contractTerms, contractToForm, parsePlates, vehicleServiceState } from './domain';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ContractsApi>()),
  fetchContracts: vi.fn(),
  saveContract: vi.fn(),
  endContract: vi.fn(),
  buildContractInvoice: vi.fn(),
}));
vi.mock('@/features/planning/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlanningApi>()),
  saveAppointment: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RepairOrdersApi>()),
  fetchActiveTechnicians: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const contract = (overrides: Partial<Contract> = {}): Contract =>
  ({
    id: 'k1',
    client_id: 'c1',
    client_name: 'Transports Martin',
    service_description: 'Vidange + contrôle général',
    frequency_months: 6,
    frequency_km: 30000,
    monthly_price_ht: 250,
    starts_on: '2026-01-15',
    ended_on: null,
    is_active: true,
    vehicles: [
      {
        vehicle_id: 'v1',
        plate: 'GH-512-RT',
        vehicle_type: 'pl',
        last_service_at: '2026-03-10T08:00:00Z',
        km_since_service: 28500,
        appointment_planned: false,
        service_due: true,
      },
      {
        vehicle_id: 'v2',
        plate: 'AB-777-ZZ',
        vehicle_type: 'vul',
        last_service_at: null,
        km_since_service: null,
        appointment_planned: true,
        service_due: true,
      },
      {
        vehicle_id: 'v3',
        plate: 'CD-888-YY',
        vehicle_type: 'pl',
        last_service_at: '2026-09-01T08:00:00Z',
        km_since_service: 1200,
        appointment_planned: false,
        service_due: false,
      },
    ],
    ...overrides,
  }) as Contract;

beforeEach(() => {
  vi.mocked(fetchContracts).mockResolvedValue([
    contract(),
    contract({
      id: 'k2',
      client_name: 'Logistique Durand',
      is_active: false,
      ended_on: '2026-06-30',
      vehicles: [],
    }),
  ]);
  vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
  vi.mocked(saveContract).mockResolvedValue(undefined);
  vi.mocked(endContract).mockResolvedValue(undefined);
});

const renderPage = () =>
  renderRoutes(
    [
      { path: '/contrats', element: <ContractsPage /> },
      { path: '/factures/:id', element: <p>Facture du contrat</p> },
    ],
    { initialPath: '/contrats' },
  );

describe('contrats : règles', () => {
  it('conditions du contrat, plaques saisies, état des véhicules', () => {
    expect(contractTerms(contract())).toMatch(/^tous les 6 mois ou 30\s000 km — 250,00\s€ HT \/ mois$/);
    expect(contractTerms({ frequency_months: null, frequency_km: 20000, monthly_price_ht: null })).toMatch(
      /^tous les 20\s000 km$/,
    );
    expect(parsePlates('gh512rt, AB-777-ZZ;\n gh-512-rt , ')).toEqual(['GH-512-RT', 'AB-777-ZZ']);
    expect(contract().vehicles.map(vehicleServiceState)).toEqual(['due', 'planned', 'up_to_date']);
  });

  it('formulaire : aller-retour et valeurs envoyées', () => {
    const values = contractToForm(contract());
    expect(values).toMatchObject({
      plates: 'GH-512-RT, AB-777-ZZ, CD-888-YY',
      monthly_price_ht: '250',
      frequency_km: '30000',
    });
    expect(contractFromForm({ ...values, frequency_km: '', monthly_price_ht: '199,90' })).toEqual({
      client_name: 'Transports Martin',
      service_description: 'Vidange + contrôle général',
      plates: ['GH-512-RT', 'AB-777-ZZ', 'CD-888-YY'],
      frequency_months: 6,
      frequency_km: null,
      monthly_price_ht: 199.9,
      starts_on: '2026-01-15',
    });
  });
});

describe('contrats : écran', () => {
  it('contrats en cours : véhicules à planifier, planifiés, à jour ; contrats terminés à part', async () => {
    renderPage();
    const card = await screen.findByRole('article', {
      name: 'Transports Martin — Vidange + contrôle général',
    });
    const rows = within(card).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/GH-512-RTs*dernier entretien : 10\/03\/2026 \(\+28\s500 km\)/);
    expect(within(rows[0]!).getByRole('button', { name: 'À planifier' })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('RDV planifié');
    expect(rows[2]).toHaveTextContent('À jour');
    expect(card).toHaveTextContent('1 entretien à planifier');
    expect(screen.queryByText(/Logistique Durand/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Voir les contrats terminés (1)' }));
    expect(await screen.findByText(/terminé le 30\/06\/2026/)).toBeInTheDocument();
  });

  it('planifier l’entretien : rendez-vous prérempli et rattaché au contrat', async () => {
    vi.mocked(saveAppointment).mockResolvedValue({} as never);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'À planifier' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau rendez-vous' });
    expect(within(dialog).getByLabelText('Motif')).toHaveValue(
      'Entretien contrat : Vidange + contrôle général',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveAppointment).toHaveBeenCalledWith(null, {
        client_name: 'Transports Martin',
        plate: 'GH-512-RT',
        vehicle_type: 'pl',
        scheduled_date: addDays(todayIso(), 2),
        start_time: '09:00',
        end_time: '10:00',
        reason: 'Entretien contrat : Vidange + contrôle général',
        technician_id: null,
        maintenance_contract_id: 'k1',
      }),
    );
  });

  it('facturer le mois ouvre le brouillon de facture', async () => {
    vi.mocked(buildContractInvoice).mockResolvedValue('inv-1');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Facturer le mois' }));
    expect(await screen.findByText('Facture du contrat')).toBeInTheDocument();
    expect(buildContractInvoice).toHaveBeenCalledWith('k1');
  });

  it('nouveau contrat : fréquence obligatoire, puis enregistrement', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Nouveau contrat' }));
    const dialog = screen.getByRole('dialog', { name: 'Nouveau contrat d’entretien' });
    await userEvent.type(within(dialog).getByLabelText('Client'), 'Transports Neuf');
    await userEvent.type(within(dialog).getByLabelText(/Véhicules/), 'zz111aa, zz222bb');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Indique une fréquence (mois ou km)')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Tous les … mois'), '12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(saveContract).toHaveBeenCalledWith(
        null,
        expect.objectContaining({
          client_name: 'Transports Neuf',
          plates: ['ZZ-111-AA', 'ZZ-222-BB'],
          frequency_months: 12,
        }),
      ),
    );
  });

  it('mettre fin à un contrat après confirmation', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Transports Martin — Vidange/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Mettre fin au contrat' }));
    const confirm = screen.getByRole('dialog', { name: 'Mettre fin à ce contrat ?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Mettre fin au contrat' }));
    await waitFor(() => expect(endContract).toHaveBeenCalledWith('k1', todayIso()));
  });
});
