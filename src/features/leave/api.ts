import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';
import type { LeaveType } from './domain';

export type LeaveRequest = Tables<'leave_requests'> & { technician_name: string };

/** Congés et absences non supprimés (le technicien ne reçoit que les siens). */
export async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, technician:technicians(display_name)')
    .eq('is_deleted', false)
    .order('starts_on', { ascending: false })
    .limit(300);
  if (error) throw error;
  return data.map(({ technician, ...leave }) => ({ ...leave, technician_name: technician.display_name }));
}

export interface LeaveInput {
  /** Absent pour la demande du technicien lui-même. */
  technician_id: string | null;
  leave_type: LeaveType;
  starts_on: string;
  ends_on: string;
  comment: string;
}

/** Demande (technicien, en attente) ou absence saisie par la direction (validée d'office). */
export async function saveLeaveRequest(input: LeaveInput) {
  const { error } = await supabase.rpc('save_leave_request', {
    p_technician_id: input.technician_id ?? undefined,
    p_leave_type: input.leave_type,
    p_starts_on: input.starts_on,
    p_ends_on: input.ends_on,
    p_comment: input.comment,
  });
  if (error) throw error;
}

export async function decideLeaveRequest(id: string, approve: boolean) {
  const { error } = await supabase.rpc('decide_leave_request', { p_id: id, p_approve: approve });
  if (error) throw error;
}

export async function deleteLeaveRequest(id: string) {
  const { error } = await supabase.rpc('delete_leave_request', { p_id: id });
  if (error) throw error;
}
