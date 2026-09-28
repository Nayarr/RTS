import { mondayOf } from '@/features/planning/domain';
import type { DateRange, ProfitabilityRow, TechnicianPerformanceRow } from './api';

// ---------------------------------------------------------------- Périodes

export type Period = 'semaine' | 'mois' | 'trimestre' | 'annee' | 'tout';

export const PERIOD_LABELS: Record<Period, string> = {
  semaine: 'Cette semaine',
  mois: 'Ce mois',
  trimestre: '3 derniers mois',
  annee: 'Cette année',
  tout: 'Tout',
};

/** Début de la période (jour de Paris) ; la fin est toujours « maintenant ». */
export function periodRange(period: Period, today: string): DateRange {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (period) {
    case 'semaine':
      return { from: mondayOf(today), to: null };
    case 'mois':
      return { from: monthStart, to: null };
    case 'trimestre': {
      const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
      const start = new Date(Date.UTC(year, month - 3, 1));
      return { from: start.toISOString().slice(0, 10), to: null };
    }
    case 'annee':
      return { from: `${today.slice(0, 4)}-01-01`, to: null };
    case 'tout':
      return { from: null, to: null };
  }
}

// ---------------------------------------------------------------- Rentabilité

export interface ProfitabilityFigures {
  ro_count: number;
  labor_ht: number;
  parts_ht: number;
  parts_margin_ht: number;
  billed_hours: number;
  worked_hours: number;
}

export interface ClientProfitability extends ProfitabilityFigures {
  client_id: string | null;
  client_name: string;
  unpaid_ttc: number;
  vehicles: ProfitabilityRow[];
}

const emptyFigures = (): ProfitabilityFigures => ({
  ro_count: 0,
  labor_ht: 0,
  parts_ht: 0,
  parts_margin_ht: 0,
  billed_hours: 0,
  worked_hours: 0,
});

function addFigures(target: ProfitabilityFigures, row: ProfitabilityFigures) {
  target.ro_count += row.ro_count;
  target.labor_ht += row.labor_ht;
  target.parts_ht += row.parts_ht;
  target.parts_margin_ht += row.parts_margin_ht;
  target.billed_hours += row.billed_hours;
  target.worked_hours += row.worked_hours;
}

export const revenue = (figures: Pick<ProfitabilityFigures, 'labor_ht' | 'parts_ht'>) =>
  figures.labor_ht + figures.parts_ht;

/** Regroupe les véhicules par client (du plus gros CA au plus petit) et calcule le total. */
export function groupByClient(rows: ProfitabilityRow[]) {
  const clients = new Map<string, ClientProfitability>();
  const total = { ...emptyFigures(), unpaid_ttc: 0 };
  for (const row of rows) {
    const key = row.client_id ?? '—';
    let client = clients.get(key);
    if (!client) {
      client = {
        ...emptyFigures(),
        client_id: row.client_id,
        client_name: row.client_name,
        unpaid_ttc: row.client_unpaid_ttc,
        vehicles: [],
      };
      clients.set(key, client);
      total.unpaid_ttc += row.client_unpaid_ttc;
    }
    client.vehicles.push(row);
    addFigures(client, row);
    addFigures(total, row);
  }
  const list = [...clients.values()].sort((a, b) => revenue(b) - revenue(a));
  for (const client of list) client.vehicles.sort((a, b) => revenue(b) - revenue(a));
  return { clients: list, total };
}

/** Écart des heures réelles sur les heures facturées, en % (null sans l'une des deux). */
export const hoursGapPercent = ({ billed_hours, worked_hours }: ProfitabilityFigures) =>
  billed_hours > 0 && worked_hours > 0 ? ((worked_hours - billed_hours) / billed_hours) * 100 : null;

/** Rouge : plus de 20 % de temps passé en plus du facturé ; vert : facturé au-delà du temps passé. */
export function gapTone(gap: number | null): 'bad' | 'good' | 'neutral' {
  if (gap === null) return 'neutral';
  if (gap > 20) return 'bad';
  if (gap < -5) return 'good';
  return 'neutral';
}

/** Taux horaire réel : main d'œuvre facturée ÷ heures réellement badgées. */
export const realHourlyRate = ({ labor_ht, worked_hours }: ProfitabilityFigures) =>
  worked_hours > 0 ? labor_ht / worked_hours : null;

// ---------------------------------------------------------------- Performance des techniciens

export interface TechnicianScore extends TechnicianPerformanceRow {
  /** Heures facturées ÷ heures badgées, en %. */
  efficiency: number | null;
  /** Heures badgées ÷ heures de présence, en %. */
  occupancy: number | null;
  /** Note globale sur 100 (null sans aucune donnée). */
  score: number | null;
}

const clamp = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Note sur 100, comme l'ancienne appli : rendement 35 %, occupation 25 %,
 * CA relatif au meilleur 25 %, précision d'estimation 15 % (critères absents ignorés).
 */
export function scoreTechnicians(rows: TechnicianPerformanceRow[]): TechnicianScore[] {
  const bestRevenue = Math.max(0, ...rows.map((row) => row.labor_ht));
  return rows
    .map((row) => {
      const efficiency = row.worked_hours > 0 ? (row.billed_hours / row.worked_hours) * 100 : null;
      const occupancy =
        row.presence_hours !== null && row.presence_hours > 0
          ? (row.worked_hours / row.presence_hours) * 100
          : null;
      const parts = [
        { value: efficiency === null ? null : clamp(efficiency), weight: 0.35 },
        { value: occupancy === null ? null : clamp(occupancy), weight: 0.25 },
        { value: bestRevenue > 0 ? clamp((row.labor_ht / bestRevenue) * 100) : null, weight: 0.25 },
        {
          value: row.estimate_deviation_percent === null ? null : 100 - clamp(row.estimate_deviation_percent),
          weight: 0.15,
        },
      ].filter((part): part is { value: number; weight: number } => part.value !== null);
      const weight = parts.reduce((sum, part) => sum + part.weight, 0);
      const score =
        weight > 0 ? parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight : null;
      return { ...row, efficiency, occupancy, score };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/** Vert à partir de 75, orange à partir de 50, rouge en dessous. */
export function scoreTone(score: number | null): 'good' | 'warning' | 'bad' | 'neutral' {
  if (score === null) return 'neutral';
  if (score >= 75) return 'good';
  if (score >= 50) return 'warning';
  return 'bad';
}
