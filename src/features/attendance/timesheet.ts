import type { CsvCell } from '@/lib/csv';

/** Journée de pointage (vue v_daily_attendance). */
export interface AttendanceDayRow {
  technician_id: string;
  work_date: string;
  worked_seconds: number;
  overtime_seconds: number;
  late_minutes: number;
  anomalies: number;
}

export interface LeaveRange {
  technician_id: string;
  starts_on: string;
  ends_on: string;
}

export interface WeekTotal {
  week: string;
  seconds: number;
  overtimeSeconds: number;
}

export interface MonthTotal {
  seconds: number;
  overtimeSeconds: number;
  daysWorked: number;
  lates: number;
  lateMinutes: number;
  absenceDays: number;
  anomalies: number;
}

export interface Timesheet {
  weeks: WeekTotal[];
  total: MonthTotal;
}

const parseDay = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Semaine ISO « 2026-S41 » (comme l'ancienne appli). */
export function isoWeekKey(iso: string): string {
  const date = parseDay(iso);
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${target.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
}

/** Jours du mois « AAAA-MM ». */
export function monthDays(month: string): string[] {
  const days: string[] = [];
  for (const day = parseDay(`${month}-01`); toIso(day).startsWith(month); day.setDate(day.getDate() + 1)) {
    days.push(toIso(day));
  }
  return days;
}

/**
 * Relevé mensuel d'un technicien : heures et heures sup. (après 18h30) par semaine,
 * jours travaillés, retards, jours d'absence (hors dimanche), oublis de badge.
 */
export function computeTimesheet(
  technicianId: string,
  month: string,
  rows: AttendanceDayRow[],
  leaves: LeaveRange[],
): Timesheet {
  const weeks = new Map<string, WeekTotal>();
  const total: MonthTotal = {
    seconds: 0,
    overtimeSeconds: 0,
    daysWorked: 0,
    lates: 0,
    lateMinutes: 0,
    absenceDays: 0,
    anomalies: 0,
  };
  const byDay = new Map(
    rows.filter((row) => row.technician_id === technicianId).map((row) => [row.work_date, row]),
  );
  const myLeaves = leaves.filter((leave) => leave.technician_id === technicianId);

  for (const day of monthDays(month)) {
    const key = isoWeekKey(day);
    const week = weeks.get(key) ?? { week: key, seconds: 0, overtimeSeconds: 0 };
    weeks.set(key, week);
    const row = byDay.get(day);
    if (row) {
      week.seconds += row.worked_seconds;
      week.overtimeSeconds += row.overtime_seconds;
      total.seconds += row.worked_seconds;
      total.overtimeSeconds += row.overtime_seconds;
      total.anomalies += row.anomalies;
      total.daysWorked += 1;
      if (row.late_minutes > 0) {
        total.lates += 1;
        total.lateMinutes += row.late_minutes;
      }
    }
    if (
      parseDay(day).getDay() !== 0 &&
      myLeaves.some((leave) => leave.starts_on <= day && leave.ends_on >= day)
    ) {
      total.absenceDays += 1;
    }
  }
  return { weeks: [...weeks.values()], total };
}

export const TIMESHEET_CSV_HEADERS = [
  'Mois',
  'Technicien',
  'Semaine',
  'Heures travaillées',
  'Heures sup. après 18h30',
  'Jours travaillés',
  'Retards',
  'Minutes de retard',
  'Jours d’absence',
  'Oublis de badge',
];

const hours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;

/** Lignes du CSV de paie : une par semaine, puis le total du mois (colonnes de l'ancienne appli). */
export function timesheetCsvRows(
  month: string,
  sheets: { name: string; timesheet: Timesheet }[],
): CsvCell[][] {
  return sheets.flatMap(({ name, timesheet: { weeks, total } }) => [
    ...weeks.map((week) => [
      month,
      name,
      week.week,
      hours(week.seconds),
      hours(week.overtimeSeconds),
      '',
      '',
      '',
      '',
      '',
    ]),
    [
      month,
      name,
      'TOTAL MOIS',
      hours(total.seconds),
      hours(total.overtimeSeconds),
      String(total.daysWorked),
      String(total.lates),
      String(total.lateMinutes),
      String(total.absenceDays),
      String(total.anomalies),
    ],
  ]);
}
