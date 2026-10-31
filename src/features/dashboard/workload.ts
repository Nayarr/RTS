import { supabase } from '@/lib/supabase';

export type WorkloadPeriod = 'day' | 'week' | 'month';

export interface TechnicianWorkload {
  technician_id: string;
  name: string;
  color: string | null;
  available_hours: number;
  declared_hours: number;
  worked_orders: number;
  planned_hours: number;
  planned_orders: number;
  /** Présence badgée à la borne sur la période (présence en cours comprise). */
  clocked_hours: number;
  /** Chrono des OR badgé sur la période (chrono en cours compris). */
  badged_hours: number;
  /** Aucune heure disponible sur la période : congés, repos, ou atelier fermé (week-end). */
  absence: 'leave' | 'rest' | 'closed' | null;
}

export interface WorkshopWorkload {
  from: string;
  to: string;
  technicians: TechnicianWorkload[];
  to_plan: { orders: number; hours: number };
}

export async function fetchWorkshopWorkload(from: string, to: string): Promise<WorkshopWorkload> {
  const { data, error } = await supabase.rpc('workshop_workload', { p_from: from, p_to: to });
  if (error) throw error;
  return data as unknown as WorkshopWorkload;
}

export interface WorkloadDetail {
  /** Temps déclaré : travaux effectués saisis sur la période. */
  declared: {
    repair_order_id: string;
    number: string;
    plate: string | null;
    day: string;
    description: string;
    hours: number;
  }[];
  /** OR planifiés sur la période. */
  planned: { repair_order_id: string; number: string; plate: string | null; day: string; hours: number }[];
}

/** D'où viennent les heures d'un technicien sur la période. */
export async function fetchWorkloadDetail(
  technicianId: string,
  from: string,
  to: string,
): Promise<WorkloadDetail> {
  const { data, error } = await supabase.rpc('workshop_workload_detail', {
    p_technician_id: technicianId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  return data as unknown as WorkloadDetail;
}

/**
 * Heures de présence badgées non affectées à un OR (badgé − déclaré) ; 0 si tout est déclaré.
 * Ex. : 10 h badgées pour 8 h déclarées → 2 h « de trou ».
 */
export const unassignedHours = (clocked: number, declared: number) =>
  Math.max(0, Math.round((clocked - declared) * 100) / 100);

// ---------------------------------------------------------------- Périodes

const day = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => {
  const date = day(value);
  date.setUTCDate(date.getUTCDate() + days);
  return iso(date);
};

/** Début et fin (inclus) de la période qui contient `anchor`. Semaine : du lundi au dimanche. */
export function periodRange(period: WorkloadPeriod, anchor: string): { from: string; to: string } {
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') {
    const offset = (day(anchor).getUTCDay() + 6) % 7;
    const from = addDays(anchor, -offset);
    return { from, to: addDays(from, 6) };
  }
  const date = day(anchor);
  const from = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)));
  const to = iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)));
  return { from, to };
}

/** Période précédente (-1) ou suivante (+1). */
export function shiftPeriod(period: WorkloadPeriod, anchor: string, delta: number): string {
  if (period === 'day') return addDays(anchor, delta);
  if (period === 'week') return addDays(anchor, 7 * delta);
  const date = day(anchor);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1, 12)));
}

const format = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', ...options }).format(day(value));

/** « Mardi 30 septembre », « Semaine du 28 sept. au 4 oct. », « Octobre 2026 ». */
export function periodLabel(period: WorkloadPeriod, range: { from: string; to: string }): string {
  if (period === 'day') {
    const label = format(range.from, { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  if (period === 'week') {
    return `Semaine du ${format(range.from, { day: 'numeric', month: 'short' })} au ${format(range.to, {
      day: 'numeric',
      month: 'short',
    })}`;
  }
  const label = format(range.from, { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export const CURRENT_LABEL: Record<WorkloadPeriod, string> = {
  day: 'Aujourd’hui',
  week: 'Cette semaine',
  month: 'Ce mois-ci',
};

// ---------------------------------------------------------------- Couleur de la jauge

/** Part des heures disponibles déjà déclarées (0 si rien n'est disponible). */
export const loadRatio = (declared: number, available: number) => (available > 0 ? declared / available : 0);

const STOPS: [number, [number, number, number]][] = [
  [0, [0xb5, 0x45, 0x3a]], // rouge
  [0.5, [0xc9, 0x8a, 0x00]], // ambre
  [0.95, [0x13, 0x70, 0x17]], // vert
];

/**
 * Couleur continue du rouge (0 %) à l'ambre (50 %) puis au vert (95 %). À 100 % ou plus, la
 * limite de la période est atteinte : la jauge passe en or, la valeur renvoyée est « gold ».
 */
export function loadColor(ratio: number): string {
  if (ratio >= 1) return 'gold';
  const value = Math.max(0, ratio);
  const upper = STOPS.findIndex(([at]) => at >= value);
  if (upper <= 0) return rgb(STOPS[upper === 0 ? 0 : STOPS.length - 1]![1]);
  const [a, from] = STOPS[upper - 1]!;
  const [b, to] = STOPS[upper]!;
  const t = (value - a) / (b - a);
  return rgb(
    from.map((channel, index) => Math.round(channel + (to[index]! - channel) * t)) as [
      number,
      number,
      number,
    ],
  );
}

const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

/** « 41,5 h » ; un entier reste entier (« 39 h »). */
export const hours = (value: number) => `${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`;
