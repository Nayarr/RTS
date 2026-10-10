import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type ClockEventType = Database['public']['Enums']['clock_event_type'];
export type LeaveType = Database['public']['Enums']['leave_type'];

export type KioskClockResult =
  | { ok: false; message: string }
  | {
      ok: true;
      technician_name: string;
      event_type: ClockEventType;
      occurred_at: string;
      during_leave_type: LeaveType | null;
    };

/** Pointage : le PIN désigne le technicien, arrivée ou départ selon son dernier pointage du jour. */
export async function kioskClock(pin: string, photoFileId: string): Promise<KioskClockResult> {
  const { data, error } = await supabase.rpc('kiosk_clock', { p_pin: pin, p_photo_file_id: photoFileId });
  if (error) throw error;
  return data as unknown as KioskClockResult;
}

export async function verifyExitCode(code: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('verify_kiosk_exit_code', { p_code: code });
  if (error) throw error;
  return data;
}

/** Nom de l'atelier affiché en haut de la borne. */
export async function fetchCompanyName(): Promise<string> {
  const { data, error } = await supabase.from('company_settings').select('legal_name').single();
  if (error) throw error;
  return data.legal_name;
}

/** Borne : signal de présence (le bureau voit qu'elle est allumée avant d'y envoyer une signature). */
export async function kioskPing() {
  const { error } = await supabase.rpc('kiosk_ping');
  if (error) throw error;
}
