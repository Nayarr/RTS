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

export type MyDay = {
  /** Prévus les jours précédents et pas terminés : reportés au jour même, jusqu'à leur fin. */
  carriedOver: RepairOrderOverview[];
  /** Prévus aujourd'hui à une heure donnée, par heure de début puis de fin. */
  timed: RepairOrderOverview[];
  /** Sans heure précisée (ou sans date) : à caser dans la journée. */
  flexible: RepairOrderOverview[];
  /** Terminés ces 7 derniers jours. */
  recentlyDone: RepairOrderOverview[];
};

const byTime = (a: RepairOrderOverview, b: RepairOrderOverview) =>
  `${a.planned_date ?? ''}${a.planned_start ?? ''}${a.planned_end ?? '99'}`.localeCompare(
    `${b.planned_date ?? ''}${b.planned_start ?? ''}${b.planned_end ?? '99'}`,
  );

/**
 * Journée du technicien : seulement les OR du jour (ceux prévus plus tard restent masqués jusqu'à
 * leur date), les OR pas terminés des jours précédents, triés par heure, et une catégorie
 * « flexible » pour ceux sans heure. Un OR commencé reste affiché quelle que soit sa date.
 */
export function planMyDay(orders: RepairOrderOverview[], today: string, now = Date.now()): MyDay {
  const day: MyDay = { carriedOver: [], timed: [], flexible: [], recentlyDone: [] };
  const limit = now - RECENT_DONE_DAYS * 86_400_000;
  for (const order of orders) {
    if (!OPEN_STATUSES.includes(order.status)) {
      if (new Date(order.updated_at ?? order.created_at).getTime() >= limit) day.recentlyDone.push(order);
      continue;
    }
    const started = order.status === 'in_progress' || Boolean(order.running_since);
    if (!order.planned_date) day.flexible.push(order);
    else if (order.planned_date < today) day.carriedOver.push(order);
    else if (order.planned_date > today && !started) continue;
    else if (order.planned_date === today && order.planned_start) day.timed.push(order);
    else day.flexible.push(order);
  }
  day.carriedOver.sort(byTime);
  day.timed.sort(byTime);
  // Les plus anciens d'abord : ils attendent depuis plus longtemps.
  day.flexible.sort((a, b) => a.created_at.localeCompare(b.created_at));
  day.recentlyDone.sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at));
  return day;
}
