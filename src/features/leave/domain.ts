import type { Database } from '@/types/database';

export type LeaveType = Database['public']['Enums']['leave_type'];
export type LeaveStatus = Database['public']['Enums']['leave_status'];

/** Types d'absence (libellés de l'ancienne appli). */
export const LEAVE_LABELS: Record<LeaveType, string> = {
  paid_leave: 'Congés payés',
  sick: 'Maladie',
  training: 'Formation',
  other: 'Autre absence',
};

export const LEAVE_STATUS_META: Record<LeaveStatus, { label: string; className: string; badge: string }> = {
  requested: { label: 'En attente', className: 'bg-amber-500 text-white', badge: 's-warn' },
  approved: { label: 'Validée', className: 'bg-emerald-700 text-white', badge: 's-ok' },
  rejected: { label: 'Refusée', className: 'bg-muted text-muted-foreground', badge: 's-grey' },
};

const parseDay = (iso: string) => new Date(`${iso}T12:00:00`);

/** Jours d'absence : dimanches exclus (atelier fermé), comme l'ancienne appli. */
export function leaveDays(startsOn: string, endsOn: string): number {
  let count = 0;
  for (const day = parseDay(startsOn); day <= parseDay(endsOn); day.setDate(day.getDate() + 1)) {
    if (day.getDay() !== 0) count += 1;
  }
  return count;
}

const frenchDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const hhmm = (time: string) => time.slice(0, 5);

/** Durée d'une absence de quelques heures, en heures (« 13:30 » → « 18:00 » : 4,5). */
export function leaveHours(startTime: string, endTime: string): number {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return Math.max(0, minutes(endTime) - minutes(startTime)) / 60;
}

/**
 * « du 12/10/2026 au 16/10/2026 (5 j) » ; « le 12/10/2026 (1 j) » sur une journée ;
 * « le 12/10/2026 de 13:30 à 18:00 (4,5 h) » pour quelques heures.
 */
export function leavePeriod(
  startsOn: string,
  endsOn: string,
  startTime?: string | null,
  endTime?: string | null,
): string {
  if (startTime && endTime) {
    const hours = leaveHours(startTime, endTime).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    return `le ${frenchDate(startsOn)} de ${hhmm(startTime)} à ${hhmm(endTime)} (${hours} h)`;
  }
  const days = leaveDays(startsOn, endsOn);
  const range =
    startsOn === endsOn
      ? `le ${frenchDate(startsOn)}`
      : `du ${frenchDate(startsOn)} au ${frenchDate(endsOn)}`;
  return `${range} (${days} j)`;
}

/** Durée choisie dans le formulaire d'absence. */
export type LeaveDuration = 'days' | 'morning' | 'afternoon' | 'hours';
export const LEAVE_DURATIONS: [LeaveDuration, string][] = [
  ['days', 'Jour(s) entier(s)'],
  ['morning', 'Matin'],
  ['afternoon', 'Après-midi'],
  ['hours', 'Quelques heures'],
];

/** Horaires du matin et de l'après-midi, d'après les horaires de l'atelier (Réglages). */
export function halfDayTimes(
  duration: 'morning' | 'afternoon',
  hours: { workday_start: string; lunch_start: string; lunch_end: string; workday_end: string } | null,
): [string, string] {
  const settings = hours ?? {
    workday_start: '08:00',
    lunch_start: '12:00',
    lunch_end: '13:30',
    workday_end: '18:00',
  };
  return duration === 'morning'
    ? [hhmm(settings.workday_start), hhmm(settings.lunch_start)]
    : [hhmm(settings.lunch_end), hhmm(settings.workday_end)];
}
