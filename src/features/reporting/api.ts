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
