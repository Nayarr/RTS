import type { LeaveSpan, RestGroup } from '@/features/planning/domain';
import type { RepairOrderStatus } from '@/features/repair-orders/constants';
import { supabase } from '@/lib/supabase';

export interface BoardOrder {
  id: string;
  technician_id: string;
  plate: string;
  task: string;
  status: RepairOrderStatus;
  running: boolean;
  planned_start: string | null;
  planned_end: string | null;
  parts_pending: boolean;
}

export interface WorkshopBoard {
  today: string;
  company_name: string | null;
  rest_reference_monday: string | null;
  technicians: { id: string; name: string; color: string | null; rest_group: RestGroup | null }[];
  leaves: LeaveSpan[];
  orders: BoardOrder[];
  appointments: { start_time: string; plate: string | null; client_name: string | null }[];
}

/** Tableau de l'atelier du jour (bureau et borne). */
export async function fetchWorkshopBoard(): Promise<WorkshopBoard> {
  const { data, error } = await supabase.rpc('workshop_board');
  if (error) throw error;
  return data as unknown as WorkshopBoard;
}

/** Le code de sortie (commun à la borne et à la télé) est-il défini ? */
export async function exitCodeIsSet(): Promise<boolean> {
  const { data, error } = await supabase.rpc('kiosk_exit_code_is_set');
  if (error) throw error;
  return data;
}
