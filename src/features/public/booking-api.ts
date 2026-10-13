import { supabase } from '@/lib/supabase';
import type { PublicCompany } from './api';

/** Page publique de prise de rendez-vous (lien envoyé avec l'e-mail d'échéance). */
export interface PublicBooking {
  company: PublicCompany;
  plate: string | null;
  client_name: string | null;
  reason: string;
  due_date: string | null;
  /** Rendez-vous déjà demandé avec ce lien. */
  appointment: { date: string; time: string; status: 'requested' | 'planned' | 'converted' } | null;
  /** Créneaux libres (1 h), jour par jour. */
  slots: { date: string; times: string[] }[];
}

export async function fetchPublicBooking(token: string): Promise<PublicBooking | null> {
  const { data, error } = await supabase.rpc('public_booking', { p_token: token });
  if (error) throw error;
  return (data as PublicBooking | null) ?? null;
}

export async function bookAppointment(token: string, date: string, time: string) {
  const { data, error } = await supabase.rpc('public_book_appointment', {
    p_token: token,
    p_date: date,
    p_time: time,
  });
  if (error) throw error;
  return data as PublicBooking['appointment'];
}
