import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchActiveTechnicians } from '@/features/repair-orders/api';
import type * as RepairOrdersApi from '@/features/repair-orders/api';
import { addDays } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { renderRoutes } from '@/test/render';
import {
  decideLeaveRequest,
  deleteLeaveRequest,
  fetchLeaveRequests,
  saveLeaveRequest,
  type LeaveRequest,
} from './api';
import type * as LeaveApi from './api';
import { leaveDays, leavePeriod } from './domain';
import { LeavePage } from './LeavePage';
import { MyLeaveSection } from './MyLeaveSection';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof LeaveApi>()),
  fetchLeaveRequests: vi.fn(),
  saveLeaveRequest: vi.fn(),
  decideLeaveRequest: vi.fn(),
  deleteLeaveRequest: vi.fn(),
}));
vi.mock('@/features/repair-orders/api', async (importOriginal) => ({
  ...(await importOriginal<typeof RepairOrdersApi>()),
  fetchActiveTechnicians: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const leave = (overrides: Partial<LeaveRequest> = {}): LeaveRequest =>
  ({
    id: 'l1',
    technician_id: 't1',
    technician_name: 'Alice',
    leave_type: 'paid_leave',
    starts_on: '2026-10-12',
    ends_on: '2026-10-17',
    comment: 'Vacances',
    status: 'requested',
    is_deleted: false,
    ...overrides,
  }) as LeaveRequest;

beforeEach(() => {
  vi.mocked(fetchActiveTechnicians).mockResolvedValue([
    { id: 't1', display_name: 'Alice', color: null },
    { id: 't2', display_name: 'Bruno', color: null },
  ]);
  vi.mocked(saveLeaveRequest).mockResolvedValue(undefined);
  vi.mocked(decideLeaveRequest).mockResolvedValue(undefined);
  vi.mocked(deleteLeaveRequest).mockResolvedValue(undefined);
});

describe('congés : règles', () => {
  it('jours d’absence hors dimanche, période lisible', () => {
    expect(leaveDays('2026-10-12', '2026-10-18')).toBe(6); // lundi → dimanche
    expect(leaveDays('2026-10-18', '2026-10-18')).toBe(0);
    expect(leavePeriod('2026-10-12', '2026-10-17')).toBe('du 12/10/2026 au 17/10/2026 (6 j)');
    expect(leavePeriod('2026-10-12', '2026-10-12')).toBe('le 12/10/2026 (1 j)');
  });
});

describe('congés : direction', () => {
  // Demandes d'octobre 2026 encore à venir, quel que soit le jour où le test tourne
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T10:00:00+02:00'));
  });
  afterEach(() => vi.useRealTimers());

  const renderPage = () =>
    renderRoutes([{ path: '/pointages/conges', element: <LeavePage /> }], {
      initialPath: '/pointages/conges',
    });

  it('demandes à traiter, puis historique', async () => {
    vi.mocked(fetchLeaveRequests).mockResolvedValue([
      leave(),
      leave({ id: 'l2', technician_name: 'Bruno', leave_type: 'sick', status: 'approved', comment: null }),
      leave({ id: 'l3', status: 'rejected', starts_on: '2026-09-01', ends_on: '2026-09-01' }),
    ]);
    renderPage();
    const requests = await screen.findByRole('region', { name: 'Demandes à traiter (1)' });
    const request = within(requests).getByRole('article', { name: 'Alice · Congés payés' });
    expect(request).toHaveTextContent('du 12/10/2026 au 17/10/2026 (6 j) · Vacances');
    expect(request).toHaveTextContent('En attente');

    const history = screen.getByRole('region', { name: 'Historique' });
    const rows = () =>
      within(history)
        .getAllByRole('row')
        .slice(1)
        .map((item) => item.getAttribute('aria-label'));
    expect(rows()).toEqual(['Bruno · Maladie']);
    await userEvent.click(within(history).getByRole('button', { name: 'Passées' }));
    expect(rows()).toEqual(['Alice · Congés payés']);
    expect(within(history).getByText('Refusée')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Congés et absences/ })).toHaveAttribute('aria-current', 'page');
  });

  it('valider, refuser, supprimer', async () => {
    vi.mocked(fetchLeaveRequests).mockResolvedValue([
      leave(),
      leave({ id: 'l2', status: 'approved', technician_name: 'Bruno' }),
    ]);
    renderPage();
    const request = await screen.findByRole('article', { name: 'Alice · Congés payés' });
    await userEvent.click(within(request).getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(decideLeaveRequest).toHaveBeenCalledWith('l1', true));
    await userEvent.click(within(request).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(decideLeaveRequest).toHaveBeenLastCalledWith('l1', false));

    await userEvent.click(
      within(screen.getByRole('row', { name: 'Bruno · Congés payés' })).getByRole('button', {
        name: 'Supprimer',
      }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Supprimer cette absence ?' })).getByRole('button', {
        name: 'Supprimer',
      }),
    );
    await waitFor(() => expect(deleteLeaveRequest).toHaveBeenCalledWith('l2'));
  });

  it('absence saisie par la direction pour un technicien', async () => {
    vi.mocked(fetchLeaveRequests).mockResolvedValue([]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter une absence' }));
    const dialog = screen.getByRole('dialog', { name: 'Ajouter une absence' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Technicien'), 't2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'sick');
    await userEvent.clear(within(dialog).getByLabelText('Du'));
    await userEvent.type(within(dialog).getByLabelText('Du'), '2026-10-14');
    await userEvent.clear(within(dialog).getByLabelText('Au (inclus)'));
    await userEvent.type(within(dialog).getByLabelText('Au (inclus)'), '2026-10-13');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer l’absence' }));
    expect(
      await within(dialog).findByText('La fin doit être le même jour ou après le début'),
    ).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Au (inclus)'));
    await userEvent.type(within(dialog).getByLabelText('Au (inclus)'), '2026-10-19');
    expect(within(dialog).getByText('5 jours (dimanches non comptés)')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer l’absence' }));
    await waitFor(() =>
      expect(saveLeaveRequest).toHaveBeenCalledWith({
        technician_id: 't2',
        leave_type: 'sick',
        starts_on: '2026-10-14',
        ends_on: '2026-10-19',
        start_time: null,
        end_time: null,
        comment: '',
      }),
    );
  });
});

describe('congés : technicien', () => {
  it('demande de congé, suivi et annulation d’une demande en attente', async () => {
    const today = todayIso();
    vi.mocked(fetchLeaveRequests).mockResolvedValue([
      leave({ starts_on: addDays(today, 10), ends_on: addDays(today, 12) }),
      leave({ id: 'l2', status: 'approved', starts_on: addDays(today, 30), ends_on: addDays(today, 30) }),
      leave({ id: 'l3', status: 'approved', starts_on: '2026-01-05', ends_on: '2026-01-06' }), // passé
    ]);
    renderRoutes([{ path: '/', element: <MyLeaveSection /> }]);
    const list = await screen.findByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('En attente');
    expect(within(list).getAllByRole('button', { name: 'Annuler' })).toHaveLength(1);

    await userEvent.click(within(list).getByRole('button', { name: 'Annuler' }));
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la demande' }));
    await waitFor(() => expect(deleteLeaveRequest).toHaveBeenCalledWith('l1'));

    await userEvent.click(screen.getByRole('button', { name: 'Demander un congé' }));
    const dialog = screen.getByRole('dialog', { name: 'Demande de congé' });
    expect(within(dialog).queryByLabelText('Technicien')).toBeNull();
    await userEvent.type(within(dialog).getByLabelText('Commentaire'), ' Mariage ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() =>
      expect(saveLeaveRequest).toHaveBeenCalledWith({
        technician_id: null,
        leave_type: 'paid_leave',
        starts_on: today,
        ends_on: today,
        start_time: null,
        end_time: null,
        comment: 'Mariage',
      }),
    );
  });

  it('absence d’un après-midi ou de quelques heures', async () => {
    const today = todayIso();
    vi.mocked(fetchLeaveRequests).mockResolvedValue([
      leave({
        status: 'approved',
        starts_on: addDays(today, 2),
        ends_on: addDays(today, 2),
        start_time: '13:30:00',
        end_time: '18:00:00',
      }),
    ]);
    vi.mocked(saveLeaveRequest).mockClear();
    renderRoutes([{ path: '/', element: <MyLeaveSection /> }]);
    expect(await screen.findByText(/de 13:30 à 18:00 \(4,5 h\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Demander un congé' }));
    const dialog = screen.getByRole('dialog', { name: 'Demande de congé' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Après-midi' }));
    expect(within(dialog).getByLabelText('De')).not.toHaveValue('');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Quelques heures' }));
    await userEvent.clear(within(dialog).getByLabelText('De'));
    await userEvent.type(within(dialog).getByLabelText('De'), '09:00');
    await userEvent.clear(within(dialog).getByLabelText('À'));
    await userEvent.type(within(dialog).getByLabelText('À'), '11:00');
    expect(within(dialog).getByText('2 h d’absence')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() =>
      expect(saveLeaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({ starts_on: today, ends_on: today, start_time: '09:00', end_time: '11:00' }),
      ),
    );
  });
});
