import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type MonthlyStatistics = Database['public']['Functions']['monthly_statistics']['Returns'][number];

/** Chiffre d'affaires HT des 12 derniers mois, du plus ancien au plus récent. */
export async function fetchMonthlyStatistics(): Promise<MonthlyStatistics[]> {
  const { data, error } = await supabase.rpc('monthly_statistics');
  if (error) throw error;
  return data;
}

export interface ClientOverdue {
  client_id: string;
  client_name: string;
  invoice_count: number;
  amount: number;
  max_days_late: number;
}

export interface ClientPaymentHabit {
  client_id: string;
  client_name: string;
  invoice_count: number;
  average_delay_days: number;
}

export interface TreasuryOverview {
  collected_this_month: number;
  due_within_30_days: number;
  overdue: number;
  weeks: { starts_on: string; amount: number }[];
  overdue_by_client: ClientOverdue[];
  payment_habits: ClientPaymentHabit[];
}

/** Trésorerie calculée par la base (montants TTC). */
export async function fetchTreasury(): Promise<TreasuryOverview> {
  const { data, error } = await supabase.rpc('treasury_overview');
  if (error) throw error;
  return data as unknown as TreasuryOverview;
}

type Nullable<T, K extends keyof T> = Omit<T, K> & { [P in K]: T[P] | null };

/** Client absent possible (OR sans client) ; les types générés ne le disent pas. */
export type ProfitabilityRow = Nullable<
  Database['public']['Functions']['profitability_report']['Returns'][number],
  'client_id'
>;

/** Présence, précision et délai absents sans pointage ni OR facturé sur la période. */
export type TechnicianPerformanceRow = Nullable<
  Database['public']['Functions']['technician_performance']['Returns'][number],
  'color' | 'presence_hours' | 'estimate_deviation_percent' | 'average_lead_days'
>;

export interface DateRange {
  from: string | null;
  to: string | null;
}

/** Rentabilité par client et véhicule (OR facturés sur la période). */
export async function fetchProfitability({ from, to }: DateRange): Promise<ProfitabilityRow[]> {
  const { data, error } = await supabase.rpc('profitability_report', {
    p_from: from ?? undefined,
    p_to: to ?? undefined,
  });
  if (error) throw error;
  return data;
}

/** Chiffres des techniciens actifs sur la période. */
export async function fetchTechnicianPerformance({
  from,
  to,
}: DateRange): Promise<TechnicianPerformanceRow[]> {
  const { data, error } = await supabase.rpc('technician_performance', {
    p_from: from ?? undefined,
    p_to: to ?? undefined,
  });
  if (error) throw error;
  return data;
}
