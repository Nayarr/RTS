import { updateAppSettings } from '@/features/settings/api';
import { supabase } from '@/lib/supabase';
import type { Database, Tables } from '@/types/database';

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
}

/** Pointages du jour, par technicien actif : présence, anomalies, absences, codes PIN. */
export async function fetchAttendanceDay(date: string): Promise<TechnicianDay[]> {
  const [technicians, events, attendance, leaves, pins] = await Promise.all([
    supabase
      .from('technicians')
      .select('id, display_name')
      .eq('is_active', true)
      .order('sort_order')
      .order('display_name'),
    supabase.from('clock_events').select('*').eq('work_date', date).order('occurred_at'),
    supabase.from('v_daily_attendance').select('*').eq('work_date', date),
    supabase
      .from('leave_requests')
      .select('technician_id, leave_type')
      .eq('status', 'approved')
      .eq('is_deleted', false)
      .lte('starts_on', date)
      .gte('ends_on', date),
    supabase.rpc('technician_pin_status'),
  ]);
  for (const result of [technicians, events, attendance, leaves, pins]) if (result.error) throw result.error;
  const withPin = new Set((pins.data ?? []).map((pin) => pin.technician_id));

  return (technicians.data ?? []).map((technician) => {
    const day = (attendance.data ?? []).find((row) => row.technician_id === technician.id);
    return {
      ...technician,
      hasPin: withPin.has(technician.id),
      events: (events.data ?? []).filter((event) => event.technician_id === technician.id),
      attendance: day
        ? {
            worked_seconds: day.worked_seconds ?? 0,
            overtime_seconds: day.overtime_seconds ?? 0,
            anomalies: day.anomalies ?? 0,
            open_session: day.open_session ?? false,
            late_minutes: day.late_minutes ?? 0,
          }
        : null,
      leaveType:
        (leaves.data ?? []).find((leave) => leave.technician_id === technician.id)?.leave_type ?? null,
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
