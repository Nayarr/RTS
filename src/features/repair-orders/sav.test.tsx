import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  createRepairOrder,
  fetchActiveTechnicians,
  fetchRepairOrder,
  fetchSavOrigin,
  findVehicleByPlate,
  markRepairOrderSav,
} from './api';
import type * as RoApi from './api';
import { NewRepairOrderPage } from './NewRepairOrderPage';
import { SavBadge, SavButton } from './sav';
import { canOpenSav, savPath } from './sav-rules';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof RoApi>()),
  createRepairOrder: vi.fn(),
  fetchActiveTechnicians: vi.fn(),
  fetchRepairOrder: vi.fn(),
  fetchSavOrigin: vi.fn(),
  findVehicleByPlate: vi.fn(),
  markRepairOrderSav: vi.fn(),
  updateRepairOrder: vi.fn(),
  searchVehiclesByPlate: vi.fn().mockResolvedValue([]),
  findClientByName: vi.fn().mockImplementation((name: string) => Promise.resolve({ id: 'c1', name })),
  searchClients: vi.fn().mockResolvedValue([]),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

beforeEach(() => {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: '00000000-0000-0000-0000-0000000000e1',
    email: 'reception@test.fr',
    full_name: 'Réception',
    role: 'reception',
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
});

describe('SAV : règles et pastille', () => {
  it('SAV possible une fois le travail fini, adresse de création', () => {
    expect(canOpenSav('invoiced')).toBe(true);
    expect(canOpenSav('to_invoice')).toBe(true);
    expect(canOpenSav('assigned')).toBe(false);
    expect(savPath('ro1')).toBe('/or/nouveau?sav=ro1');
  });

  it('pastille violette seulement pour un OR de SAV', () => {
    renderRoutes([
      {
        path: '/',
        element: (
          <>
            <SavBadge order={{ sav_of_repair_order_id: 'ro1', sav_of_number: 'OR00012' }} />
            <SavBadge order={{ sav_of_repair_order_id: null, sav_of_number: null }} />
          </>
        ),
      },
    ]);
    const badges = screen.getAllByText('SAV');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveClass('s-sav');
    expect(badges[0]).toHaveAttribute('title', 'SAV de OR00012');
  });

  it('facture groupée : choix de l’OR repris', async () => {
    renderRoutes([
      {
        path: '/',
        element: (
          <SavButton
            orders={[
              { id: 'ro1', number: 'OR00012' },
              { id: 'ro2', number: 'OR00013' },
            ]}
          />
        ),
      },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /SAV/ }));
    expect(await screen.findByRole('menuitem', { name: 'SAV de OR00013' })).toHaveAttribute(
      'href',
      '/or/nouveau?sav=ro2',
    );
  });
});

describe('SAV : création de l’OR de reprise', () => {
  it('véhicule et client repris, responsable par défaut le technicien d’origine, OR marqué SAV', async () => {
    vi.mocked(fetchSavOrigin).mockResolvedValue({
      id: 'ro1',
      number: 'OR00012',
      plate: 'GH-512-RT',
      vehicle_type: 'pl',
      client_name: 'Transports Martin',
      technician_id: 't1',
      technician_name: 'Alice',
    });
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([
      { id: 't1', display_name: 'Alice', color: null },
      { id: 't2', display_name: 'Bruno', color: null },
    ]);
    vi.mocked(findVehicleByPlate).mockResolvedValue(null);
    vi.mocked(createRepairOrder).mockResolvedValue({ id: 'ro9', number: 'OR00099' } as never);
    vi.mocked(markRepairOrderSav).mockResolvedValue();
    vi.mocked(fetchRepairOrder).mockResolvedValue(null);
    renderRoutes(
      [
        { path: '/or/nouveau', element: <NewRepairOrderPage /> },
        { path: '/or/:id', element: <p>Fiche OR</p> },
      ],
      { initialPath: '/or/nouveau?sav=ro1', auth: { session: fakeSession() } },
    );

    expect(await screen.findByRole('heading', { name: 'Nouvel OR de SAV' })).toBeInTheDocument();
    const banner = screen.getByRole('region', { name: 'SAV' });
    expect(banner).toHaveTextContent('Reprise de l’OR OR00012');
    await waitFor(() => expect(screen.getByLabelText('Immatriculation')).toHaveValue('GH-512-RT'));
    expect(screen.getByLabelText('Client')).toHaveValue('Transports Martin');
    expect(within(banner).getByRole('combobox', { name: 'Responsable du SAV' })).toHaveTextContent('Alice');

    // La direction désigne Bruno comme responsable
    await userEvent.click(within(banner).getByRole('combobox', { name: 'Responsable du SAV' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Bruno' }));
    await userEvent.type(screen.getByLabelText('Tâche à faire'), 'Reprise embrayage');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’OR' }));

    await waitFor(() => expect(markRepairOrderSav).toHaveBeenCalledWith('ro9', 'ro1', 't2'));
  });

  it('OR normal : rien de SAV', async () => {
    vi.mocked(fetchActiveTechnicians).mockResolvedValue([]);
    renderRoutes([{ path: '/or/nouveau', element: <NewRepairOrderPage /> }], {
      initialPath: '/or/nouveau',
      auth: { session: fakeSession() },
    });
    expect(await screen.findByRole('heading', { name: 'Nouvel ordre de réparation' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'SAV' })).toBeNull();
    expect(fetchSavOrigin).not.toHaveBeenCalled();
  });
});
