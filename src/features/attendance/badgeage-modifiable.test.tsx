import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchProfile } from '@/features/auth/api';
import type * as AuthApi from '@/features/auth/api';
import { fetchFileUrls } from '@/features/files/api';
import type * as FilesApi from '@/features/files/api';
import { fakeSession, renderRoutes } from '@/test/render';
import {
  fetchAttendanceDay,
  fetchKioskSettings,
  updateClockEvent,
  type ClockEvent,
  type TechnicianDay,
} from './api';
import type * as AttendanceApi from './api';
import { AttendancePage } from './AttendancePage';

vi.mock('@/features/auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  fetchProfile: vi.fn(),
}));
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AttendanceApi>()),
  fetchAttendanceDay: vi.fn(),
  fetchKioskSettings: vi.fn(),
  updateClockEvent: vi.fn(),
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
  occurred_at: '2026-11-13T08:32:00Z',
  work_date: '2026-11-13',
  source: 'kiosk',
  photo_file_id: null,
  photo_purged_at: null,
  during_leave_type: null,
  reason: null,
  entered_by: null,
  legacy_id: null,
  created_at: '2026-11-13T08:32:00Z',
  original_occurred_at: null,
  original_event_type: null,
  edited_at: null,
  edited_by: null,
  edit_reason: null,
  ...overrides,
});

const omar = (events: ClockEvent[]): TechnicianDay => ({
  id: 't1',
  display_name: 'Omar',
  hasPin: true,
  events,
  attendance: null,
  leaveType: null,
  leaveHours: null,
  badgedDuringLeave: false,
  scheduled: true,
  clockRequired: true,
  absent: false,
});

const renderPage = (role: 'direction' | 'accountant' = 'direction') => {
  vi.mocked(fetchProfile).mockResolvedValue({
    id: 'p1',
    email: 'direction@test.fr',
    full_name: 'Direction',
    role,
    is_active: true,
    created_at: '2026-09-27T00:00:00Z',
    updated_at: '2026-09-27T00:00:00Z',
  });
  return renderRoutes([{ path: '/pointages', element: <AttendancePage /> }], {
    initialPath: '/pointages?date=2026-11-13',
    auth: { session: fakeSession() },
  });
};

beforeEach(() => {
  vi.mocked(fetchKioskSettings).mockResolvedValue({ exitCodeSet: true, photoRetentionMonths: 3 });
  vi.mocked(fetchFileUrls).mockResolvedValue({});
});

describe('badgeage modifiable', () => {
  it('la direction rectifie l’heure d’un badgeage de la borne avec un motif', async () => {
    vi.mocked(fetchAttendanceDay).mockResolvedValue([omar([event({})])]);
    vi.mocked(updateClockEvent).mockResolvedValue();
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Modifier le pointage : Arrivée 09:32' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Modifier le badgeage' });
    const time = within(dialog).getByLabelText('Heure');
    expect(time).toHaveValue('09:32');
    await userEvent.clear(time);
    await userEvent.type(time, '08:58');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Indique le motif')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Motif'), 'Badge oublié');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(updateClockEvent).toHaveBeenCalledWith({
        id: 'e1',
        event_type: 'in',
        time: '08:58',
        reason: 'Badge oublié',
      }),
    );
  });

  it('badgeage déjà modifié : mention « Modifié » avec l’heure d’origine', async () => {
    vi.mocked(fetchAttendanceDay).mockResolvedValue([
      omar([
        event({
          occurred_at: '2026-11-13T07:58:00Z',
          original_occurred_at: '2026-11-13T08:32:00Z',
          edited_at: '2026-11-13T12:00:00Z',
          edit_reason: 'Badge oublié',
        }),
      ]),
    ]);
    renderPage();
    const tag = await screen.findByText('Modifié');
    expect(tag).toHaveAttribute('title', 'Heure d’origine 09:32 · Badge oublié');
  });

  it('comptable : pas de modification', async () => {
    vi.mocked(fetchAttendanceDay).mockResolvedValue([omar([event({})])]);
    renderPage('accountant');
    await screen.findByRole('article', { name: 'Omar' });
    expect(screen.queryByRole('button', { name: /Modifier le pointage/ })).toBeNull();
  });
});
