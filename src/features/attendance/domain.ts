import type { TechnicianDay } from './api';

/** Heures travaillées : paires arrivée / départ, plus la présence en cours aujourd'hui. */
export function workedSeconds(day: TechnicianDay, isToday: boolean, now: Date): number {
  const closed = day.attendance?.worked_seconds ?? 0;
  const last = day.events[day.events.length - 1];
  if (!isToday || last?.event_type !== 'in') return closed;
  return closed + Math.max(0, Math.round((now.getTime() - new Date(last.occurred_at).getTime()) / 1000));
}

/** « 7h05 » (comme l'ancienne appli). */
export function formatHoursMinutes(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/** Retard : « 12 min », ou « 1h05 » au-delà d'une heure. */
export const formatLate = (minutes: number) =>
  minutes < 60 ? `${minutes} min` : formatHoursMinutes(minutes * 60);

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
