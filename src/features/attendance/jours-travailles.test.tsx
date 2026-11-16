import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFileUrls } from '@/features/files/api';
import type * as FilesApi from '@/features/files/api';
import { renderRoutes } from '@/test/render';
import { fetchAttendanceDay, fetchKioskSettings, isAbsentDay, type TechnicianDay } from './api';
import type * as AttendanceApi from './api';
import { AttendancePage } from './AttendancePage';
import { computeTimesheet } from './timesheet';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AttendanceApi>()),
  fetchAttendanceDay: vi.fn(),
  fetchKioskSettings: vi.fn(),
}));
vi.mock('@/features/files/api', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesApi>()),
  fetchFileUrls: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const tech = (overrides: Partial<TechnicianDay>): TechnicianDay => ({
  id: 't1',
  display_name: 'Nicolas',
  hasPin: true,
  events: [],
  attendance: null,
  leaveType: null,
  leaveHours: null,
  badgedDuringLeave: false,
  scheduled: true,
  clockRequired: true,
  absent: false,
  ...overrides,
});

beforeEach(() => {
  vi.mocked(fetchKioskSettings).mockResolvedValue({ exitCodeSet: false, photoRetentionMonths: 3 });
  vi.mocked(fetchFileUrls).mockResolvedValue({});
});

describe('jours travaillés : absence non justifiée', () => {
  const day = { scheduled: true, clockRequired: true, hasEvents: false, onLeave: false };
  const morning = new Date('2026-11-14T08:00:00+01:00');
  const afternoon = new Date('2026-11-14T10:00:00+01:00');

  it('jour travaillé passé sans badgeage : absent', () => {
    expect(isAbsentDay(day, '2026-11-13', '2026-11-14', '09:05:00', morning)).toBe(true);
  });

  it('aujourd’hui : absent seulement après l’heure de tolérance', () => {
    expect(isAbsentDay(day, '2026-11-14', '2026-11-14', '09:05:00', morning)).toBe(false);
    expect(isAbsentDay(day, '2026-11-14', '2026-11-14', '09:05:00', afternoon)).toBe(true);
  });

  it('jamais absent un jour non travaillé, en congé, avec un badgeage, ou sans badgeage requis', () => {
    expect(isAbsentDay({ ...day, scheduled: false }, '2026-11-13', '2026-11-14', '09:05', morning)).toBe(
      false,
    );
    expect(isAbsentDay({ ...day, onLeave: true }, '2026-11-13', '2026-11-14', '09:05', morning)).toBe(false);
    expect(isAbsentDay({ ...day, hasEvents: true }, '2026-11-13', '2026-11-14', '09:05', morning)).toBe(
      false,
    );
    expect(isAbsentDay({ ...day, clockRequired: false }, '2026-11-13', '2026-11-14', '09:05', morning)).toBe(
      false,
    );
  });

  it('relevé : jours travaillés sans badgeage ni congé comptés en absence, pas les jours de repos', () => {
    const schedule = [
      { technician_id: 't1', day: '2026-11-13', scheduled: true, clock_required: true },
      { technician_id: 't1', day: '2026-11-14', scheduled: false, clock_required: true },
      { technician_id: 't1', day: '2026-11-16', scheduled: true, clock_required: true },
    ];
    const { total } = computeTimesheet('t1', '2026-11', [], [], schedule, '2026-11-16');
    expect(total.absenceDays).toBe(1);
    expect(total.unexcusedDays).toBe(1);
  });
});

describe('jours travaillés : page Pointages', () => {
  it('absent en rouge, repos en gris, compte qui ne badge pas sans alerte de code PIN', async () => {
    vi.mocked(fetchAttendanceDay).mockResolvedValue([
      tech({ id: 't1', display_name: 'Karim', absent: true }),
      tech({ id: 't2', display_name: 'Nicolas', scheduled: false }),
      tech({ id: 't3', display_name: 'Rayan', clockRequired: false, hasPin: false }),
    ]);
    renderRoutes([{ path: '/pointages', element: <AttendancePage /> }], {
      initialPath: '/pointages?date=2026-11-14',
    });

    const karim = await screen.findByRole('article', { name: 'Karim' });
    expect(karim).toHaveTextContent('Absent');
    expect(screen.getByRole('article', { name: 'Nicolas' })).toHaveTextContent('Repos');
    expect(screen.getByRole('article', { name: 'Nicolas' })).not.toHaveTextContent('Absent');
    const rayan = screen.getByRole('article', { name: 'Rayan' });
    expect(rayan).toHaveTextContent('Ne badge pas');
    expect(rayan).not.toHaveTextContent('Pas de code PIN');
  });
});
