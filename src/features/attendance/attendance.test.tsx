import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFileUrls } from '@/features/files/api';
import type * as FilesApi from '@/features/files/api';
import { renderRoutes } from '@/test/render';
import {
  addManualClockEvent,
  deleteManualClockEvent,
  fetchAttendanceDay,
  fetchKioskSettings,
  setKioskExitCode,
  updatePhotoRetention,
  type ClockEvent,
  type TechnicianDay,
} from './api';
import type * as AttendanceApi from './api';
import { AttendancePage } from './AttendancePage';
import { formatHoursMinutes, formatLate, workedSeconds } from './domain';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AttendanceApi>()),
  fetchAttendanceDay: vi.fn(),
  fetchKioskSettings: vi.fn(),
  addManualClockEvent: vi.fn(),
  deleteManualClockEvent: vi.fn(),
  setKioskExitCode: vi.fn(),
  updatePhotoRetention: vi.fn(),
}));
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchFileUrls: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const event = (overrides: Partial<ClockEvent>): ClockEvent => ({
  id: 'e1',
  technician_id: 't1',
  event_type: 'in',
  occurred_at: '2026-09-21T06:57:00Z',
  work_date: '2026-09-21',
  source: 'kiosk',
  photo_file_id: 'f1',
  photo_purged_at: null,
  during_leave_type: null,
  reason: null,
  entered_by: null,
  legacy_id: null,
  created_at: '2026-09-21T06:57:00Z',
  ...overrides,
});

const DAY: TechnicianDay[] = [
  {
    id: 't1',
    display_name: 'Alice',
    hasPin: true,
    events: [
      event({}),
      event({ id: 'e2', event_type: 'out', occurred_at: '2026-09-21T16:45:00Z', photo_file_id: 'f2' }),
      event({
        id: 'e3',
        event_type: 'in',
        occurred_at: '2026-09-21T17:00:00Z',
        source: 'manual',
        photo_file_id: null,
        reason: 'Oubli de badge',
      }),
    ],
    attendance: {
      worked_seconds: 35280,
      overtime_seconds: 0,
      anomalies: 1,
      open_session: true,
      late_minutes: 0,
    },
    leaveType: null,
  },
  {
    id: 't2',
    display_name: 'Bruno',
    hasPin: false,
    events: [
      event({ id: 'e4', technician_id: 't2', occurred_at: '2026-09-21T07:40:00Z', photo_file_id: 'f4' }),
    ],
    attendance: {
      worked_seconds: 0,
      overtime_seconds: 2700,
      anomalies: 0,
      open_session: true,
      late_minutes: 40,
    },
    leaveType: 'paid_leave',
  },
];

beforeEach(() => {
  vi.mocked(fetchAttendanceDay).mockResolvedValue(DAY);
  vi.mocked(fetchKioskSettings).mockResolvedValue({ exitCodeSet: false, photoRetentionMonths: 3 });
  vi.mocked(fetchFileUrls).mockResolvedValue({ f1: 'https://r2/f1.jpg', f2: 'https://r2/f2.jpg' });
});

const renderPage = (date = '2026-09-21') =>
  renderRoutes([{ path: '/pointages', element: <AttendancePage /> }], {
    initialPath: `/pointages?date=${date}`,
  });

describe('pointages : calculs', () => {
  it('heures au format de l’ancienne appli, retard, présence en cours', () => {
    expect(formatHoursMinutes(35280)).toBe('9h48');
    expect(formatHoursMinutes(0)).toBe('0h00');
    expect(formatLate(12)).toBe('12 min');
    expect(formatLate(65)).toBe('1h05');
    const now = new Date('2026-09-21T18:00:00Z');
    expect(workedSeconds(DAY[0]!, false, now)).toBe(35280);
    expect(workedSeconds(DAY[0]!, true, now)).toBe(35280 + 3600);
  });
});

describe('pointages : écran', () => {
  it('présence du jour par technicien : heures, anomalies, retard, absence, PIN', async () => {
    renderPage();
    const alice = await screen.findByRole('article', { name: 'Alice' });
    expect(fetchAttendanceDay).toHaveBeenCalledWith('2026-09-21');
    expect(within(alice).getByText('9h48')).toBeInTheDocument();
    expect(within(alice).getByText(/Pointage incomplet/)).toBeInTheDocument();
    expect(within(alice).queryByText('Présent')).toBeNull(); // jour passé
    const events = within(alice).getAllByRole('listitem');
    expect(events.map((item) => item.textContent)).toEqual(['↘ 08:57', '↗ 18:45', 'Manuel↘ 19:00manuel']);
    expect(await within(alice).findByRole('button', { name: 'Photo : Arrivée 08:57' })).toBeInTheDocument();

    const bruno = screen.getByRole('article', { name: 'Bruno' });
    expect(within(bruno).getByText('Retard : 40 min')).toBeInTheDocument();
    expect(within(bruno).getByText('Heures sup. : 0h45')).toBeInTheDocument();
    expect(within(bruno).getByText(/Congés payés/)).toHaveTextContent(
      'Congés payés — a badgé pendant son absence',
    );
    expect(within(bruno).getByRole('link', { name: 'Pas de code PIN' })).toHaveAttribute('href', '/equipe');
  });

  it('photo agrandie', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Photo : Arrivée 08:57' }));
    const dialog = screen.getByRole('dialog', { name: 'Alice — arrivée 08:57' });
    expect(await within(dialog).findByRole('img')).toHaveAttribute('src', 'https://r2/f1.jpg');
  });

  it('correction manuelle : motif obligatoire', async () => {
    vi.mocked(addManualClockEvent).mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Correction manuelle' }));
    const dialog = screen.getByRole('dialog', { name: 'Correction de pointage' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Technicien'), 't2');
    await userEvent.selectOptions(within(dialog).getByLabelText('Type'), 'out');
    await userEvent.clear(within(dialog).getByLabelText('Heure'));
    await userEvent.type(within(dialog).getByLabelText('Heure'), '17:30');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Indique le motif')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Motif'), ' Borne en panne ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(addManualClockEvent).toHaveBeenCalledWith({
        technician_id: 't2',
        event_type: 'out',
        time: '17:30',
        reason: 'Borne en panne',
        work_date: '2026-09-21',
      }),
    );
  });

  it('suppression d’une correction manuelle après confirmation', async () => {
    vi.mocked(deleteManualClockEvent).mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Supprimer la correction : Arrivée 19:00' }),
    );
    const confirm = screen.getByRole('dialog', { name: 'Supprimer cette correction ?' });
    expect(confirm).toHaveTextContent('Oubli de badge');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(deleteManualClockEvent).toHaveBeenCalledWith('e3'));
    // Les pointages de la borne n'ont pas de bouton de suppression
    expect(screen.queryByRole('button', { name: /Supprimer la correction : Arrivée 08:57/ })).toBeNull();
  });

  it('navigation par jour, pas de jour futur', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Alice' });
    await userEvent.click(screen.getByRole('button', { name: 'Jour précédent' }));
    await waitFor(() => expect(fetchAttendanceDay).toHaveBeenLastCalledWith('2026-09-20'));
    expect(screen.getByRole('heading', { name: 'Dimanche 20/09' })).toBeInTheDocument();
  });

  it('réglages de la borne : code de sortie et conservation des photos', async () => {
    vi.mocked(setKioskExitCode).mockResolvedValue(undefined);
    vi.mocked(updatePhotoRetention).mockResolvedValue(undefined);
    renderPage();
    expect(await screen.findByText('Non défini')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Garder les photos'), '6');
    await waitFor(() => expect(updatePhotoRetention).toHaveBeenCalledWith(6));

    await userEvent.click(screen.getByRole('button', { name: 'Définir le code' }));
    const dialog = screen.getByRole('dialog', { name: 'Code de sortie de la borne' });
    await userEvent.type(within(dialog).getByLabelText('Nouveau code'), '9753');
    await userEvent.type(within(dialog).getByLabelText('Confirme le code'), '9750');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(within(dialog).getByText('Les deux codes ne correspondent pas')).toBeInTheDocument();
    await userEvent.clear(within(dialog).getByLabelText('Confirme le code'));
    await userEvent.type(within(dialog).getByLabelText('Confirme le code'), '9753');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(setKioskExitCode).toHaveBeenCalledWith('9753'));
  });
});
