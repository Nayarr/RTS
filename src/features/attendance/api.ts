import { updateAppSettings } from '@/features/settings/api';
import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/types/database';
import { monthDays, type AttendanceDayRow, type LeaveRange, type ScheduleDay } from './timesheet';

export type ClockEvent = Tables<'clock_events'>;
export type ClockEventType = Database['public']['Enums']['clock_event_type'];
export type LeaveType = Database['public']['Enums']['leave_type'];

export interface DailyAttendance {
  worked_seconds: number;
  overtime_seconds: number;
  anomalies: number;
  open_session: boolean;
  late_minutes: number;
}

export interface TechnicianDay {
  id: string;
  display_name: string;
  hasPin: boolean;
  events: ClockEvent[];
  attendance: DailyAttendance | null;
  leaveType: LeaveType | null;
  /** Absence de quelques heures : créneau « 09:00-14:00 » (null : journée entière). */
  leaveHours: string | null;
  /** Un badgeage du jour tombe dans l'absence validée. */
  badgedDuringLeave: boolean;
  /** Jour travaillé pour ce compte (jours cochés, alternance, présences en plus ; atelier ouvert). */
  scheduled: boolean;
  /** Le compte badge à la borne. */
  clockRequired: boolean;
  /** Jour travaillé sans badgeage ni congé, passé ou après l'heure de tolérance. */
  absent: boolean;
}

/** Jour de Paris « AAAA-MM-JJ » d'un instant. */
const parisDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);

/** Heure de Paris « HH:MM » d'un instant. */
const parisTime = (date: Date) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(
    date,
  );

/** Absence non justifiée : la journée est passée, ou l'heure de tolérance de l'arrivée l'est aujourd'hui. */
export function isAbsentDay(
  day: { scheduled: boolean; clockRequired: boolean; hasEvents: boolean; onLeave: boolean },
  date: string,
  today: string,
  lateTolerance: string,
  now: Date,
) {
  if (!day.scheduled || !day.clockRequired || day.hasEvents || day.onLeave) return false;
  if (date < today) return true;
  return date === today && parisTime(now) > lateTolerance.slice(0, 5);
}

/** Pointages du jour, par technicien actif : présence, anomalies, absences, codes PIN. */
export async function fetchAttendanceDay(date: string, now = new Date()): Promise<TechnicianDay[]> {
  const [technicians, events, attendance, leaves, pins, schedule, settings] = await Promise.all([
    supabase
      .from('technicians')
      .select('id, display_name, clock_required')
      .eq('is_active', true)
      .order('sort_order')
      .order('display_name'),
    supabase.from('clock_events').select('*').eq('work_date', date).order('occurred_at'),
    supabase.from('v_daily_attendance').select('*').eq('work_date', date),
    supabase
      .from('leave_requests')
      .select('technician_id, leave_type, start_time, end_time')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .lte('starts_on', date)
      .gte('ends_on', date),
    supabase.rpc('technician_pin_status'),
    supabase.rpc('technician_schedule', { p_from: date, p_to: date }),
    supabase.from('app_settings').select('late_tolerance').maybeSingle(),
  ]);
  for (const result of [technicians, events, attendance, leaves, pins, schedule, settings])
    if (result.error) throw result.error;
  const withPin = new Set((pins.data ?? []).map((pin) => pin.technician_id));
  const today = parisDate(now);
  const lateTolerance = settings.data?.late_tolerance ?? '09:05';

  return (technicians.data ?? []).map(({ clock_required, ...technician }) => {
    const scheduled =
      (schedule.data ?? []).find((row) => row.technician_id === technician.id)?.scheduled ?? true;
    const day = (attendance.data ?? []).find((row) => row.technician_id === technician.id);
    const leave = (leaves.data ?? []).find((row) => row.technician_id === technician.id);
    const techEvents = (events.data ?? []).filter((event) => event.technician_id === technician.id);
    return {
      ...technician,
      hasPin: withPin.has(technician.id),
      events: techEvents,
      attendance: day
        ? {
            worked_seconds: day.worked_seconds ?? 0,
            overtime_seconds: day.overtime_seconds ?? 0,
            anomalies: day.anomalies ?? 0,
            open_session: day.open_session ?? false,
            late_minutes: day.late_minutes ?? 0,
          }
        : null,
      leaveType: leave?.leave_type ?? null,
      leaveHours:
        leave?.start_time && leave.end_time
          ? `${leave.start_time.slice(0, 5)}-${leave.end_time.slice(0, 5)}`
          : null,
      // Marqué par la base au badgeage (créneau de l'absence pour une absence de quelques heures)
      badgedDuringLeave: techEvents.some((event) => event.during_leave_type !== null),
      scheduled,
      clockRequired: clock_required,
      absent: isAbsentDay(
        {
          scheduled,
          clockRequired: clock_required,
          hasEvents: techEvents.length > 0,
          onLeave: Boolean(leave),
        },
        date,
        today,
        lateTolerance,
        now,
      ),
    };
  });
}

export interface ManualClockInput {
  technician_id: string;
  event_type: ClockEventType;
  work_date: string;
  time: string;
  reason: string;
}

export async function addManualClockEvent(input: ManualClockInput) {
  const { error } = await supabase.rpc('add_manual_clock_event', {
    p_technician_id: input.technician_id,
    p_event_type: input.event_type,
    p_work_date: input.work_date,
    p_time: input.time,
    p_reason: input.reason,
  });
  if (error) throw error;
}

/** Badgeage existant rectifié par la direction (heure, sens) : heure d'origine gardée, motif obligatoire. */
export async function updateClockEvent(input: {
  id: string;
  event_type: ClockEventType;
  time: string;
  reason: string;
}) {
  const { error } = await supabase.rpc('update_clock_event', {
    p_event_id: input.id,
    p_event_type: input.event_type,
    p_time: input.time,
    p_reason: input.reason,
  });
  if (error) throw error;
}

/** Seules les corrections manuelles se suppriment (la base refuse pour la borne). */
export async function deleteManualClockEvent(id: string) {
  const { data, error } = await supabase.from('clock_events').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression réservée à la direction');
}

export interface KioskSettings {
  exitCodeSet: boolean;
  photoRetentionMonths: number;
}

export async function fetchKioskSettings(): Promise<KioskSettings> {
  const [exitCode, settings] = await Promise.all([
    supabase.rpc('kiosk_exit_code_is_set'),
    supabase.from('app_settings').select('clock_photo_retention_months').single(),
  ]);
  if (exitCode.error) throw exitCode.error;
  if (settings.error) throw settings.error;
  return { exitCodeSet: exitCode.data, photoRetentionMonths: settings.data.clock_photo_retention_months };
}

export async function setKioskExitCode(code: string) {
  const { error } = await supabase.rpc('set_kiosk_exit_code', { p_code: code });
  if (error) throw error;
}

export const updatePhotoRetention = (months: number) =>
  updateAppSettings({ clock_photo_retention_months: months });

export interface TimesheetData {
  technicians: { id: string; display_name: string }[];
  days: AttendanceDayRow[];
  leaves: LeaveRange[];
  /** Jours travaillés de chaque fiche sur le mois (absences non justifiées). */
  schedule: ScheduleDay[];
}

/** Pointages journaliers et absences validées du mois « AAAA-MM ». */
export async function fetchTimesheet(month: string): Promise<TimesheetData> {
  const days = monthDays(month);
  const from = days[0] ?? `${month}-01`;
  const to = days[days.length - 1] ?? from;
  const [technicians, attendance, leaves, schedule] = await Promise.all([
    supabase
      .from('technicians')
      .select('id, display_name')
      .eq('is_active', true)
      .order('sort_order')
      .order('display_name'),
    supabase.from('v_daily_attendance').select('*').gte('work_date', from).lte('work_date', to),
    supabase
      .from('leave_requests')
      .select('technician_id, starts_on, ends_on')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .lte('starts_on', to)
      .gte('ends_on', from),
    supabase.rpc('technician_schedule', { p_from: from, p_to: to }),
  ]);
  for (const result of [technicians, attendance, leaves, schedule]) if (result.error) throw result.error;
  return {
    technicians: technicians.data ?? [],
    days: (attendance.data ?? []).flatMap((row) =>
      row.technician_id && row.work_date
        ? [
            {
              technician_id: row.technician_id,
              work_date: row.work_date,
              worked_seconds: row.worked_seconds ?? 0,
              overtime_seconds: row.overtime_seconds ?? 0,
              late_minutes: row.late_minutes ?? 0,
              anomalies: row.anomalies ?? 0,
            },
          ]
        : [],
    ),
    leaves: leaves.data ?? [],
    schedule: schedule.data ?? [],
  };
}
