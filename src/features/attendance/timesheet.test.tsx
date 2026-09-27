import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { downloadFile } from '@/lib/csv';
import type * as Csv from '@/lib/csv';
import { renderRoutes } from '@/test/render';
import { fetchTimesheet, type TimesheetData } from './api';
import type * as AttendanceApi from './api';
import { computeTimesheet, isoWeekKey, monthDays, timesheetCsvRows } from './timesheet';
import { TimesheetPage } from './TimesheetPage';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AttendanceApi>()),
  fetchTimesheet: vi.fn(),
}));
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof Csv>()),
  downloadFile: vi.fn(),
}));

const row = (work_date: string, overrides: Partial<TimesheetData['days'][number]> = {}) => ({
  technician_id: 't1',
  work_date,
  worked_seconds: 8 * 3600,
  overtime_seconds: 0,
  late_minutes: 0,
  anomalies: 0,
  ...overrides,
});

const DATA: TimesheetData = {
  technicians: [
    { id: 't1', display_name: 'Alice' },
    { id: 't2', display_name: 'Bruno' },
  ],
  days: [
    row('2026-10-01'),
    row('2026-10-02', { overtime_seconds: 1800, late_minutes: 20 }),
    row('2026-10-05', { worked_seconds: 4 * 3600, anomalies: 1 }),
    row('2026-10-05', { technician_id: 't2', worked_seconds: 3600 }),
  ],
  // Du samedi 10 au lundi 12 : 2 jours (dimanche non compté)
  leaves: [{ technician_id: 't1', starts_on: '2026-10-10', ends_on: '2026-10-12' }],
};

describe('relevé : calculs', () => {
  it('semaines ISO et jours du mois', () => {
    expect(isoWeekKey('2026-10-01')).toBe('2026-S40');
    expect(isoWeekKey('2026-10-05')).toBe('2026-S41');
    expect(isoWeekKey('2027-01-01')).toBe('2026-S53');
    expect(monthDays('2026-02')).toHaveLength(28);
    expect(monthDays('2026-10').at(-1)).toBe('2026-10-31');
  });

  it('heures par semaine et totaux du mois', () => {
    const { weeks, total } = computeTimesheet('t1', '2026-10', DATA.days, DATA.leaves);
    expect(weeks.slice(0, 2)).toEqual([
      { week: '2026-S40', seconds: 16 * 3600, overtimeSeconds: 1800 },
      { week: '2026-S41', seconds: 4 * 3600, overtimeSeconds: 0 },
    ]);
    expect(weeks.map((week) => week.week)).toEqual([
      '2026-S40',
      '2026-S41',
      '2026-S42',
      '2026-S43',
      '2026-S44',
    ]);
    expect(total).toEqual({
      seconds: 20 * 3600,
      overtimeSeconds: 1800,
      daysWorked: 3,
      lates: 1,
      lateMinutes: 20,
      absenceDays: 2,
      anomalies: 1,
    });
  });

  it('CSV de paie : une ligne par semaine puis le total', () => {
    const rows = timesheetCsvRows('2026-10', [
      { name: 'Alice', timesheet: computeTimesheet('t1', '2026-10', DATA.days, DATA.leaves) },
    ]);
    expect(rows[0]).toEqual(['2026-10', 'Alice', '2026-S40', 16, 0.5, '', '', '', '', '']);
    expect(rows.at(-1)).toEqual(['2026-10', 'Alice', 'TOTAL MOIS', 20, 0.5, '3', '1', '20', '2', '1']);
  });
});

describe('relevé : écran', () => {
  it('résumé par technicien, semaines, export CSV', async () => {
    vi.mocked(fetchTimesheet).mockResolvedValue(DATA);
    renderRoutes([{ path: '/pointages/releve', element: <TimesheetPage /> }], {
      initialPath: '/pointages/releve?mois=2026-10',
    });
    const alice = await screen.findByRole('article', { name: 'Alice' });
    expect(fetchTimesheet).toHaveBeenCalledWith('2026-10');
    expect(alice).toHaveTextContent(
      '3 jours travaillés — 20h00 — HS : 0h30 — 1 retard (20 min) — 2 j d’absence — 1 oubli de badge',
    );
    expect(within(alice).getAllByRole('row')[1]).toHaveTextContent('2026-S4016h000h30');
    expect(screen.getByRole('article', { name: 'Bruno' })).toHaveTextContent(
      '1 jour travaillé — 1h00 — HS : 0h00 — 0 retard',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Export CSV (paie)' }));
    const [content, fileName] = vi.mocked(downloadFile).mock.calls[0] ?? [];
    expect(fileName).toBe('releve_heures_2026-10.csv');
    expect(content).toContain('Mois;Technicien;Semaine;Heures travaillées;Heures sup. après 18h30');
    expect(content).toContain('2026-10;Alice;TOTAL MOIS;20,00;0,50;3;1;20;2;1');
  });
});
