import type { RepairOrderOverview, RoLine } from '@/features/repair-orders/api';
import { OPEN_STATUSES } from '@/features/repair-orders/constants';
import type { InspectionData } from '@/features/repair-orders/inspection';
import { todayIso } from '@/features/repair-orders/schemas';

/** Estimations proposées au technicien (comme l'ancienne appli, plus 0,5 h) ; « 12h+ » = au moins 12 h. */
export const TIME_OPTIONS = [
  '0h',
  '0.5h',
  ...Array.from({ length: 12 }, (_, hours) => `${hours + 1}h`),
  '12h+',
] as const;

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

const optionHours = (option: string) => parseTimeOption(option).estimated_hours ?? 0;

/** Options du sélecteur, en gardant à sa place une valeur existante hors liste (ex. 1,5 h saisie au bureau). */
export function timeOptionsFor(current: string): string[] {
  if (!current || (TIME_OPTIONS as readonly string[]).includes(current)) return [...TIME_OPTIONS];
  const index = TIME_OPTIONS.findIndex((option) => optionHours(option) > optionHours(current));
  const at = index === -1 ? TIME_OPTIONS.length - 1 : index;
  return [...TIME_OPTIONS.slice(0, at), current, ...TIME_OPTIONS.slice(at)];
}

/** Libellé affiché d'une option : « 0,5 h », « 12 h et plus ». */
export const timeOptionLabel = (option: string) =>
  option.endsWith('+') ? `${option.slice(0, -2)} h et plus` : `${option.slice(0, -1).replace('.', ',')} h`;

// ---------------------------------------------------------------- Clôture de l'OR

/** Photo exigée quand l'étiquette du contrôle hayon est HS (même libellé que le bouton photo). */
export const TAILGATE_PHOTO_LABEL = 'Étiquette contrôle hayon';

const hasTime = (line: RoLine) =>
  line.estimated_hours !== null ||
  // Forfait à prévoir : son temps barème suffit pour le devis.
  (line.kind === 'planned' && line.line_type === 'package' && line.standard_hours !== null);

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

/**
 * Ce qu'il reste à compléter avant « Travaux terminés » (mêmes règles que la base) : temps estimé de
 * chaque tâche, taille des pneus à 50 % ou HS, photo de l'étiquette du contrôle hayon HS.
 */
export function finishBlockers(
  lines: RoLine[],
  inspection: InspectionData | null,
  photoLabels: string[],
): string[] {
  const blockers: string[] = [];
  const timed = (kind: RoLine['kind']) =>
    lines.filter(
      (line) =>
        line.kind === kind && (line.line_type === 'labor' || line.line_type === 'package') && !hasTime(line),
    ).length;
  const done = timed('done');
  const planned = timed('planned');
  if (done) blockers.push(`Temps réel manquant : ${plural(done, 'tâche')} des travaux effectués`);
  if (planned) blockers.push(`Temps estimé manquant : ${plural(planned, 'tâche')} à prévoir`);
  for (const [side, label] of [
    ['avant', 'avant'],
    ['arriere', 'arrière'],
  ] as const) {
    const state = inspection?.pneus?.[`${side}_etat`];
    if ((state === '50' || state === 'HS') && !inspection?.pneus?.[`${side}_taille`]?.trim()) {
      blockers.push(`Taille des pneus ${label} obligatoire (${state === 'HS' ? 'HS' : '50 %'})`);
    }
  }
  if (inspection?.controles?.hayon === 'HS' && !photoLabels.includes(TAILGATE_PHOTO_LABEL)) {
    blockers.push('Photo de l’étiquette contrôle hayon obligatoire (HS)');
  }
  return blockers;
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

// ---------------------------------------------------------------- Étiquette du contrôle hayon

/** Jours entre aujourd'hui et l'échéance (négatif : dépassée). */
export function daysUntil(date: string, today = todayIso()) {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

/** Comme l'ancienne appli : échéance dans 30 jours ou moins → contrôle hayon « HS » (à faire). */
export function tailgateVerdict(date: string, today = todayIso()) {
  const days = daysUntil(date, today);
  if (days < 0) return { value: 'HS' as const, label: `À FAIRE — dépassé depuis ${-days} j` };
  if (days <= 30) return { value: 'HS' as const, label: `À FAIRE — échéance dans ${days} j` };
  return { value: 'OK' as const, label: `OK — valable encore ${days} jours` };
}
