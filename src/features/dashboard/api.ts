import type { RepairOrderCategory } from '@/features/repair-orders/constants';
import { supabase } from '@/lib/supabase';

export interface WorkloadRow {
  technician_id: string;
  name: string;
  color: string | null;
  orders: number;
  hours: number;
}

export interface OfficeDashboard {
  /** OR non facturés par catégorie (« unassigned » : sans technicien). */
  repair_orders: Partial<Record<RepairOrderCategory, number>>;
  parts_to_order: number;
  quotes_awaiting_response: number;
  quotes_to_convert: number;
  overdue_invoices: { count: number; balance_due: number };
  appointments_today: number;
  reminders_to_send: number;
  leave_requests: number;
  workload: WorkloadRow[];
}

/** Chiffres du tableau de bord, calculés par la base en une requête. */
export async function fetchOfficeDashboard(): Promise<OfficeDashboard> {
  const { data, error } = await supabase.rpc('office_dashboard');
  if (error) throw error;
  return data as unknown as OfficeDashboard;
}
