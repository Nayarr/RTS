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

/** « du 12/10/2026 au 16/10/2026 (5 j) » ; « le 12/10/2026 (1 j) » sur une journée. */
export function leavePeriod(startsOn: string, endsOn: string): string {
  const days = leaveDays(startsOn, endsOn);
  const range =
    startsOn === endsOn
      ? `le ${frenchDate(startsOn)}`
      : `du ${frenchDate(startsOn)} au ${frenchDate(endsOn)}`;
  return `${range} (${days} j)`;
}
