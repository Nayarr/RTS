import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { OPEN_STATUSES } from '@/features/repair-orders/constants';

/** Estimations proposées au technicien (comme l'ancienne appli) ; « 12h+ » = au moins 12 h. */
export const TIME_OPTIONS = [...Array.from({ length: 13 }, (_, hours) => `${hours}h`), '12h+'] as const;

/** Valeur du sélecteur ↔ colonnes estimated_hours / estimate_is_minimum. */
export function timeOptionValue(hours: number | null, isMinimum: boolean): string {
  if (hours === null) return '';
  if (isMinimum) return `${hours}h+`;
  return `${hours}h`;
}

export function parseTimeOption(value: string): {
  estimated_hours: number | null;
  estimate_is_minimum: boolean;
} {
  const match = /^(\d+(?:[.,]\d+)?)h(\+?)$/.exec(value);
  if (!match?.[1]) return { estimated_hours: null, estimate_is_minimum: false };
  return { estimated_hours: Number(match[1].replace(',', '.')), estimate_is_minimum: match[2] === '+' };
}

/** Options du sélecteur, en gardant une valeur existante hors liste (ex. 0,5 h saisie au bureau). */
export function timeOptionsFor(current: string): string[] {
  return current && !(TIME_OPTIONS as readonly string[]).includes(current)
    ? [TIME_OPTIONS[0], current, ...TIME_OPTIONS.slice(1)]
    : [...TIME_OPTIONS];
}

export type SeenState = 'new' | 'updated' | null;

/** « Nouveau » : jamais ouvert ; « Modifié » : affectation / planning / tâche changés depuis. */
export function seenState(order: RepairOrderOverview, seenAt: string | undefined): SeenState {
  if (!OPEN_STATUSES.includes(order.status)) return null;
  if (!seenAt) return 'new';
  return order.assignment_changed_at && order.assignment_changed_at > seenAt ? 'updated' : null;
}

const RECENT_DONE_DAYS = 7;

/**
 * Liste du technicien : OR à faire (planifiés d'abord, par heure, puis les plus récents),
 * et OR terminés des 7 derniers jours.
 */
export function splitMyOrders(orders: RepairOrderOverview[], now = Date.now()) {
  const active = orders
    .filter((order) => OPEN_STATUSES.includes(order.status))
    .sort((a, b) => {
      if (a.planned_start && b.planned_start) {
        return `${a.planned_date}${a.planned_start}`.localeCompare(`${b.planned_date}${b.planned_start}`);
      }
      if (a.planned_start) return -1;
      if (b.planned_start) return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  const limit = now - RECENT_DONE_DAYS * 86_400_000;
  const recentlyDone = orders
    .filter((order) => !OPEN_STATUSES.includes(order.status))
    .filter((order) => new Date(order.updated_at ?? order.created_at).getTime() >= limit)
    .sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
  return { active, recentlyDone };
}
