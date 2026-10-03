import type { CompanySettings } from '@/features/settings/api';
import { LEAVE_LABELS, type LeaveType } from '@/features/leave/domain';
import type { SendLinkMessage } from '@/lib/send-links';
import type { Database } from '@/types/database';

export type PlanningView = 'semaine' | 'jour';
export type RestGroup = Database['public']['Enums']['rest_group'];

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// ---------------------------------------------------------------- Dates (jours locaux, « AAAA-MM-JJ »)

const parseDay = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 0 = lundi … 6 = dimanche. */
export const weekdayIndex = (iso: string) => (parseDay(iso).getDay() + 6) % 7;

export function addDays(iso: string, days: number): string {
  const date = parseDay(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

export const mondayOf = (iso: string) => addDays(iso, -weekdayIndex(iso));

export const isSunday = (iso: string) => weekdayIndex(iso) === 6;

/** Jours affichés : la semaine du lundi au dimanche, ou le jour choisi. */
export function periodDays(view: PlanningView, date: string): string[] {
  if (view === 'jour') return [date];
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** « Lundi 05/10 » */
export const dayLabel = (iso: string) => `${DAY_NAMES[weekdayIndex(iso)]} ${shortDate(iso)}`;

export function periodLabel(view: PlanningView, days: string[]): string {
  const first = days[0] ?? '';
  if (view === 'jour') return dayLabel(first);
  return `Semaine du ${shortDate(first)} au ${shortDate(days[days.length - 1] ?? first)}`;
}

// ---------------------------------------------------------------- Heures

/** « 09:30 » ou « 09:30:00 » → minutes depuis minuit. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes ?? 0);
}

/** « 09:30:00 » → « 09:30 ». */
export const shortTime = (time: string | null | undefined) => (time ? time.slice(0, 5) : '');

export interface WorkdayHours {
  workday_start: string;
  workday_end: string;
  lunch_start: string;
  lunch_end: string;
  friday_lunch_start: string;
}

/** Pause déjeuner du jour (plus tôt le vendredi), en minutes. */
export function lunchBreak(iso: string, hours: WorkdayHours): [number, number] {
  const start = weekdayIndex(iso) === 4 ? hours.friday_lunch_start : hours.lunch_start;
  return [timeToMinutes(start) ?? 13 * 60, timeToMinutes(hours.lunch_end) ?? 14 * 60];
}

// ---------------------------------------------------------------- Blocs de la grille

export interface TimedEvent {
  start: number;
  end: number;
}

/** Début et fin d'un bloc : une heure par défaut sans heure de fin (comme l'ancienne appli). */
export function eventSpan(start: string | null, end: string | null): TimedEvent | null {
  const from = timeToMinutes(start);
  if (from === null) return null;
  const to = timeToMinutes(end);
  return { start: from, end: to !== null && to > from ? to : from + 60 };
}

/** Blocs qui se chevauchent placés côte à côte : colonne de chaque bloc et nombre de colonnes du groupe. */
export function layoutDayEvents<T extends TimedEvent>(
  events: T[],
): (T & { column: number; columns: number })[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: (T & { column: number; columns: number })[] = [];
  let cluster: (T & { column: number; columns: number })[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    for (const event of cluster) event.columns = columnEnds.length;
    result.push(...cluster);
    cluster = [];
    columnEnds = [];
  };

  for (const event of sorted) {
    if (cluster.length && event.start >= clusterEnd) flush();
    let column = columnEnds.findIndex((end) => end <= event.start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(event.end);
    } else {
      columnEnds[column] = event.end;
    }
    cluster.push({ ...event, column, columns: 1 });
    clusterEnd = cluster.length === 1 ? event.end : Math.max(clusterEnd, event.end);
  }
  flush();
  return result;
}

const TECH_COLORS = ['#2A6B52', '#4750B5', '#C98A00', '#8B3A9E', '#1F6FA6', '#B5453A', '#5A7D3A', '#A6461F'];

/** Couleur du technicien (réglée dans son compte), sinon tirée de son nom comme dans l'ancienne appli. */
export function technicianColor(technician: { display_name: string; color: string | null } | null): string {
  if (!technician) return '#6B7280';
  if (technician.color) return technician.color;
  const sum = [...technician.display_name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return TECH_COLORS[sum % TECH_COLORS.length] ?? '#6B7280';
}

// ---------------------------------------------------------------- Repos et absences

/** Groupe en repos ce jour-là (un lundi sur deux, à partir du lundi de référence du groupe A). */
export function restingGroup(iso: string, referenceMonday: string | null): RestGroup | null {
  if (!referenceMonday || weekdayIndex(iso) !== 0) return null;
  const weeks = Math.round(
    (parseDay(iso).getTime() - parseDay(referenceMonday).getTime()) / (7 * 86_400_000),
  );
  return ((weeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
}

export interface LeaveSpan {
  technician_id: string;
  leave_type: LeaveType;
  starts_on: string;
  ends_on: string;
}

/** « Congés payés », « Repos »… si le technicien n'est pas là ce jour-là. */
export function technicianOffLabel(
  technician: { id: string; rest_group: RestGroup | null },
  iso: string,
  leaves: LeaveSpan[],
  referenceMonday: string | null,
): string | null {
  const leave = leaves.find(
    (item) => item.technician_id === technician.id && item.starts_on <= iso && item.ends_on >= iso,
  );
  if (leave) return LEAVE_LABELS[leave.leave_type];
  if (technician.rest_group && technician.rest_group === restingGroup(iso, referenceMonday)) return 'Repos';
  return null;
}

// ---------------------------------------------------------------- Rendez-vous

/** Rappel à envoyer : rendez-vous de demain, pas encore rappelé. */
export const needsReminder = (
  appointment: { scheduled_date: string; reminder_sent_at: string | null },
  today: string,
) => appointment.scheduled_date === addDays(today, 1) && !appointment.reminder_sent_at;

/** Message de rappel de l'ancienne appli (e-mail et SMS). */
export function appointmentReminderMessage(
  appointment: { scheduled_date: string; start_time: string; plate: string | null; reason: string | null },
  company: Pick<CompanySettings, 'legal_name' | 'address_line' | 'postal_code' | 'city' | 'email'>,
): SendLinkMessage {
  const date = parseDay(appointment.scheduled_date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const time = shortTime(appointment.start_time);
  const plate = appointment.plate ?? '';
  const signature = [company.legal_name, company.email].filter(Boolean).join('\n');
  return {
    subject: `Rappel rendez-vous ${date} — ${company.legal_name}`,
    body:
      `Bonjour,\n\nNous vous rappelons votre rendez-vous à l'atelier le ${date} à ${time} pour le véhicule ${plate}` +
      `${appointment.reason ? ` (${appointment.reason})` : ''}.\n\n` +
      `Adresse : ${company.address_line}, ${company.postal_code} ${company.city}.\n` +
      `En cas d'empêchement, merci de nous prévenir.\n\nCordialement,\n${signature}`,
    sms: `Rappel RDV ${company.legal_name} ${date} à ${time} pour ${plate}. ${company.address_line}, ${company.city}.`,
  };
}

/**
 * Mécaniciens du planning : un compte Direction ou Réception rattaché à une fiche technicien
 * (pour pointer, par exemple) n'est pas un mécanicien et n'a pas de colonne.
 */
export function planningMechanics<T extends { profile?: { role: string } | null }>(
  technicians: T[],
): Omit<T, 'profile'>[] {
  return technicians
    .filter(
      (technician) => technician.profile?.role !== 'direction' && technician.profile?.role !== 'reception',
    )
    .map(({ profile: _profile, ...technician }) => technician);
}
