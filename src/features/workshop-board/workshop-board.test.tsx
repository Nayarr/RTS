import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import type { Profile } from '@/features/auth/roles';
import { verifyExitCode } from '@/features/kiosk/api';
import type * as KioskApi from '@/features/kiosk/api';
import { fetchRepairOrders, type RepairOrderOverview } from '@/features/repair-orders/api';
import type * as RepairOrdersApi from '@/features/repair-orders/api';
import { fakeSession, renderRoutes } from '@/test/render';
import { exitCodeIsSet, fetchWorkshopBoard, type BoardOrder, type WorkshopBoard } from './api';
import type * as BoardApi from './api';
import {
  boardColumns,
  cardMeta,
  expectedVehicles,
  isTvMode,
  plannedSlot,
  setTvMode,
  workshopOrders,
} from './domain';
import { LiveWorkshopPage } from './LiveWorkshopPage';
import { TvPage } from './TvPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof BoardApi>()),
  fetchWorkshopBoard: vi.fn(),
  exitCodeIsSet: vi.fn(),
}));
vi.mock('@/features/kiosk/api', async (importOriginal) => ({
  ...(await importOriginal<typeof KioskApi>()),
  verifyExitCode: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RepairOrdersApi>()),
  fetchRepairOrders: vi.fn(),
}));
vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const order = (overrides: Partial<BoardOrder> = {}): BoardOrder => ({
  id: 'ro1',
  technician_id: 't1',
  plate: 'AB-123-CD',
  task: 'Freins',
  status: 'assigned',
  running: false,
  planned_start: null,
  planned_end: null,
  parts_pending: false,
  ...overrides,
});

const board: WorkshopBoard = {
  today: '2026-09-29',
  company_name: 'RAPID TRUCK SERVICE',
  rest_reference_monday: '2026-09-28',
  technicians: [
    { id: 't1', name: 'Alice', color: '#137017', rest_group: null },
    { id: 't2', name: 'Bruno', color: '#4750B5', rest_group: null },
    { id: 't3', name: 'Chloé', color: null, rest_group: null },
  ],
  leaves: [{ technician_id: 't2', leave_type: 'sick', starts_on: '2026-09-29', ends_on: '2026-09-30' }],
  orders: [
    order({ id: 'a', plate: 'AA-111-AA', planned_start: '15:00:00' }),
    order({ id: 'b', plate: 'BB-222-BB', planned_start: '09:00:00', planned_end: '11:00:00' }),
    order({ id: 'c', plate: 'CC-333-CC', status: 'in_progress', running: true, parts_pending: true }),
    order({ id: 'd', plate: 'DD-444-DD' }),
    order({ id: 'e', plate: 'EE-555-EE' }),
    order({ id: 'f', technician_id: 't2', plate: 'FF-666-FF' }),
  ],
  appointments: [
    { start_time: '10:30:00', plate: 'GH-512-RT', client_name: 'Transports Dupont' },
    { start_time: '14:00:00', plate: null, client_name: 'Logistique Martin' },
  ],
};

const profile = (role: Profile['role']): Profile => ({
  id: 'u1',
  email: `${role}@test.fr`,
  full_name: role,
  role,
  is_active: true,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
});

beforeEach(() => {
  vi.mocked(fetchWorkshopBoard).mockResolvedValue(board);
  vi.mocked(fetchProfile).mockResolvedValue(profile('direction'));
});
afterEach(() => setTvMode(false));

describe('écran atelier : règles', () => {
  it('colonnes : badgeage en cours d’abord, puis par heure prévue, 4 au plus ; absence', () => {
    const [alice, bruno, chloe] = boardColumns(board);
    expect(alice?.cards.map((card) => card.plate)).toEqual([
      'CC-333-CC',
      'BB-222-BB',
      'AA-111-AA',
      'DD-444-DD',
    ]);
    expect(bruno).toMatchObject({ offLabel: 'Maladie', cards: [{ plate: 'FF-666-FF' }] });
    expect(chloe).toMatchObject({ offLabel: null, cards: [] });
  });

  it('libellés des cartes et véhicules attendus', () => {
    expect(cardMeta(order({ running: true, parts_pending: true }))).toBe('● En cours · 📦 attente pièces');
    expect(cardMeta(order({ planned_start: '09:00:00', planned_end: '11:00:00' }))).toBe(
      'À faire · 09:00→11:00',
    );
    expect(expectedVehicles(board)).toBe('10:30 GH-512-RT (Transports Dupont) • 14:00 (Logistique Martin)');
  });

  it('atelier en direct : OR assignés et en cours, triés par technicien', () => {
    const ro = (id: string, status: RepairOrderOverview['status'], technician: string | null) =>
      ({ id, status, technician_name: technician }) as RepairOrderOverview;
    expect(
      workshopOrders([
        ro('1', 'in_progress', 'Bruno'),
        ro('2', 'work_done', 'Alice'),
        ro('3', 'assigned', 'Alice'),
        ro('4', 'invoiced', 'Alice'),
      ]).map((o) => o.id),
    ).toEqual(['3', '1']);
  });

  it('mode télé mémorisé sur l’appareil', () => {
    expect(isTvMode()).toBe(false);
    setTvMode(true);
    expect(isTvMode()).toBe(true);
    setTvMode(false);
    expect(isTvMode()).toBe(false);
  });
});

describe('écran atelier : télé', () => {
  it('colonnes des techniciens, absences, disponible, véhicules attendus', async () => {
    renderRoutes([{ path: '/tele', element: <TvPage /> }], { initialPath: '/tele' });
    const alice = await screen.findByRole('region', { name: 'Alice' });
    expect(
      within(alice)
        .getAllByRole('article')
        .map((card) => card.getAttribute('aria-label')),
    ).toEqual(['CC-333-CC', 'BB-222-BB', 'AA-111-AA', 'DD-444-DD']);
    expect(within(alice).getByRole('article', { name: 'CC-333-CC' })).toHaveTextContent('● En cours');
    expect(screen.getByRole('region', { name: 'Bruno' })).toHaveTextContent('Maladie');
    expect(screen.getByRole('region', { name: 'Bruno' })).not.toHaveTextContent('FF-666-FF');
    expect(screen.getByRole('region', { name: 'Chloé' })).toHaveTextContent('Disponible');
    expect(screen.getByText(/Véhicules attendus aujourd’hui/).parentElement).toHaveTextContent(
      '10:30 GH-512-RT (Transports Dupont)',
    );
    expect(isTvMode()).toBe(true);
  });

  it('sortie avec le code de la borne : l’appareil quitte le mode télé', async () => {
    vi.mocked(verifyExitCode).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderRoutes(
      [
        { path: '/tele', element: <TvPage /> },
        { path: '/', element: <h1>Accueil</h1> },
      ],
      { initialPath: '/tele' },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Quitter l’écran atelier' }));
    const dialog = screen.getByRole('dialog', { name: 'Quitter l’écran atelier' });
    await userEvent.type(within(dialog).getByLabelText('Code de sortie'), '1111');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitter' }));
    expect(await within(dialog).findByText('Code incorrect')).toBeInTheDocument();
    expect(isTvMode()).toBe(true);

    await userEvent.type(within(dialog).getByLabelText('Code de sortie'), '97531');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quitter' }));
    expect(await screen.findByRole('heading', { name: 'Accueil' })).toBeInTheDocument();
    expect(isTvMode()).toBe(false);
  });
});

describe('atelier en direct', () => {
  beforeEach(() => {
    vi.mocked(fetchRepairOrders).mockResolvedValue([
      {
        id: 'ro1',
        number: 'OR00012',
        status: 'in_progress',
        plate: 'AB-123-CD',
        client_name: 'Transports Dupont',
        technician_name: 'Alice',
        running_since: '2026-09-29T08:00:00Z',
        worked_seconds: 0,
        requested_work: 'Freins',
      } as RepairOrderOverview,
      {
        id: 'ro2',
        number: 'OR00013',
        status: 'invoiced',
        plate: 'EF-456-GH',
        technician_name: 'Bruno',
      } as RepairOrderOverview,
    ]);
  });

  const renderLive = () =>
    renderRoutes(
      [
        { path: '/atelier-en-direct', element: <LiveWorkshopPage /> },
        { path: '/tele', element: <h1>Télé</h1> },
      ],
      { initialPath: '/atelier-en-direct', auth: { session: fakeSession() } },
    );

  it('véhicules à l’atelier, badgeage, lien vers l’OR', async () => {
    renderLive();
    const card = await screen.findByRole('link', { name: 'AB-123-CD · OR00012' });
    expect(card).toHaveAttribute('href', '/or/ro1');
    expect(card).toHaveTextContent('Transports Dupont · Technicien : Alice');
    expect(card).toHaveTextContent('Badgeage en cours');
    expect(screen.getByText('1 véhicule actuellement à l’atelier.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /EF-456-GH/ })).toBeNull();
  });

  it('direction : passer l’appareil en écran télé (code de sortie requis)', async () => {
    vi.mocked(exitCodeIsSet).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderLive();
    await userEvent.click(await screen.findByRole('button', { name: 'Écran atelier (télé)' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Passer en écran télé' }),
    );
    await waitFor(() => expect(exitCodeIsSet).toHaveBeenCalledTimes(1));
    expect(isTvMode()).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Écran atelier (télé)' }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Passer en écran télé' }),
    );
    expect(await screen.findByRole('heading', { name: 'Télé' })).toBeInTheDocument();
    expect(isTvMode()).toBe(true);
  });

  it('réception : pas de bouton télé', async () => {
    vi.mocked(fetchProfile).mockResolvedValue(profile('reception'));
    renderLive();
    await screen.findByRole('link', { name: 'AB-123-CD · OR00012' });
    expect(screen.queryByRole('button', { name: 'Écran atelier (télé)' })).toBeNull();
  });
});

describe('atelier en direct : opération prévue', () => {
  const planned = (fields: Partial<RepairOrderOverview>) =>
    ({
      planned_date: null,
      planned_start: null,
      planned_end: null,
      planned_end_date: null,
      ...fields,
    }) as RepairOrderOverview;

  it('jour relatif, heures, plusieurs jours ; rien sans date', () => {
    const today = '2026-11-07';
    expect(plannedSlot(planned({}), today)).toBeNull();
    expect(plannedSlot(planned({ planned_date: today }), today)).toBe('Aujourd’hui');
    expect(
      plannedSlot(
        planned({ planned_date: today, planned_start: '08:00:00', planned_end: '12:00:00' }),
        today,
      ),
    ).toBe('Aujourd’hui 08:00 → 12:00');
    expect(plannedSlot(planned({ planned_date: '2026-11-08', planned_start: '14:00:00' }), today)).toBe(
      'Demain 14:00',
    );
    expect(plannedSlot(planned({ planned_date: '2026-11-06', planned_start: '07:30:00' }), today)).toBe(
      'Hier 07:30',
    );
    expect(
      plannedSlot(
        planned({
          planned_date: '2026-11-09',
          planned_start: '08:00:00',
          planned_end_date: '2026-11-11',
          planned_end: '17:00:00',
        }),
        today,
      ),
    ).toBe('lun. 09/11 08:00 → mer. 11/11 17:00');
    // Fin le même jour : la date n'est pas répétée
    expect(
      plannedSlot(
        planned({
          planned_date: '2026-11-10',
          planned_start: '08:00:00',
          planned_end_date: '2026-11-10',
          planned_end: '10:00:00',
        }),
        today,
      ),
    ).toBe('mar. 10/11 08:00 → 10:00');
  });

  it('carte : créneau prévu bien visible, « Pas de date prévue » sinon', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-07T10:00:00') });
    vi.mocked(fetchProfile).mockResolvedValue(profile('reception'));
    vi.mocked(fetchRepairOrders).mockResolvedValue([
      planned({
        id: 'ro1',
        number: 'OR00012',
        status: 'assigned',
        plate: 'AB-123-CD',
        technician_name: 'Alice',
        worked_seconds: 0,
        planned_date: '2026-11-07',
        planned_start: '08:00:00',
        planned_end_date: '2026-11-09',
        planned_end: '12:00:00',
      }),
      planned({ id: 'ro2', number: 'OR00013', status: 'assigned', plate: 'EF-456-GH', worked_seconds: 0 }),
    ]);
    try {
      renderRoutes([{ path: '/atelier-en-direct', element: <LiveWorkshopPage /> }], {
        initialPath: '/atelier-en-direct',
        auth: { session: fakeSession() },
      });
      const card = await screen.findByRole('link', { name: 'AB-123-CD · OR00012' });
      expect(card).toHaveTextContent('Prévu : Aujourd’hui 08:00 → lun. 09/11 12:00');
      expect(screen.getByRole('link', { name: 'EF-456-GH · OR00013' })).toHaveTextContent(
        'Pas de date prévue',
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
