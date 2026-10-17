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

/** Tables dont un changement modifie les chiffres de l'accueil (droits de l'utilisateur appliqués). */
const LIVE_TABLES = ['repair_orders', 'ro_lines', 'quotes', 'invoices', 'appointments', 'leave_requests'];

/** Changements en direct (Supabase Realtime) des données de l'accueil. */
export function subscribeToDashboardChanges(onChange: () => void): () => void {
  const channel = LIVE_TABLES.reduce(
    (current, table) => current.on('postgres_changes', { event: '*', schema: 'public', table }, onChange),
    supabase.channel('office-dashboard'),
  );
  channel.subscribe();
  return () => void supabase.removeChannel(channel);
}
