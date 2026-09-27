import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { AppRole } from '@/features/auth/roles';
import type { CreateAccountInput, TeamMember, TechnicianSettings } from './types';

/** Appelle l'Edge Function admin-users (gestion des comptes, clé secrète côté serveur). */
const invokeAdminUsers = <T>(body: Record<string, unknown>) => invokeFunction<T>('admin-users', body);

export async function fetchTeam(): Promise<TeamMember[]> {
  const [profiles, technicians, pins] = await Promise.all([
    supabase.from('profiles').select('*').order('full_name'),
    supabase.from('technicians').select('*'),
    supabase.rpc('technician_pin_status'),
  ]);
  if (profiles.error) throw profiles.error;
  if (technicians.error) throw technicians.error;
  if (pins.error) throw pins.error;

  return profiles.data.map((profile) => {
    const technician = technicians.data.find((t) => t.profile_id === profile.id) ?? null;
    const pin = technician ? pins.data.find((p) => p.technician_id === technician.id) : undefined;
    return { ...profile, technician, pinSetAt: pin?.set_at ?? null };
  });
}

export function createAccount(input: CreateAccountInput) {
  return invokeAdminUsers<{ user_id: string; invited: boolean }>({
    action: 'create',
    ...input,
    redirect_to: `${window.location.origin}/mot-de-passe/nouveau`,
  });
}

export function setAccountActive(userId: string, active: boolean) {
  return invokeAdminUsers<{ user_id: string; active: boolean }>({
    action: 'set_active',
    user_id: userId,
    active,
  });
}

export async function updateProfile(id: string, patch: { full_name: string; role: AppRole }) {
  const { error } = await supabase.from('profiles').update(patch).eq('id', id);
  if (error) throw error;
}

/** Crée ou met à jour la fiche technicien d'un compte. */
export async function saveTechnician(
  profileId: string,
  technicianId: string | null,
  settings: TechnicianSettings,
) {
  const { error } = technicianId
    ? await supabase.from('technicians').update(settings).eq('id', technicianId)
    : await supabase.from('technicians').insert({ ...settings, profile_id: profileId });
  if (error) throw error;
}

export async function setTechnicianActive(technicianId: string, isActive: boolean) {
  const { error } = await supabase.from('technicians').update({ is_active: isActive }).eq('id', technicianId);
  if (error) throw error;
}

export async function setTechnicianPin(technicianId: string, pin: string) {
  const { error } = await supabase.rpc('set_technician_pin', { p_technician_id: technicianId, p_pin: pin });
  if (error) throw error;
}

export async function clearTechnicianPin(technicianId: string) {
  const { error } = await supabase.rpc('clear_technician_pin', { p_technician_id: technicianId });
  if (error) throw error;
}

export async function fetchRestReferenceMonday(): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('rest_reference_monday').single();
  if (error) throw error;
  return data.rest_reference_monday;
}

export async function updateRestReferenceMonday(date: string | null) {
  const { error } = await supabase
    .from('app_settings')
    .update({ rest_reference_monday: date })
    .eq('id', true);
  if (error) throw error;
}
