import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert } from '@/types/database';

export type DrivingLicense = Tables<'driving_licenses'>;
export type DrivingLicenseInput = Omit<
  TablesInsert<'driving_licenses'>,
  'id' | 'created_at' | 'updated_at' | 'created_by'
>;

/** Permis rattachés au client : le sien (particulier) ou ceux de ses conducteurs (pro). */
export async function fetchClientLicenses(clientId: string): Promise<DrivingLicense[]> {
  const { data, error } = await supabase
    .from('driving_licenses')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at');
  if (error) throw error;
  return data;
}

/** Création (sans id) ou modification ; renvoie l'identifiant du permis. */
export async function saveLicense(id: string | null, input: DrivingLicenseInput): Promise<string> {
  const query = id
    ? supabase.from('driving_licenses').update(input).eq('id', id)
    : supabase.from('driving_licenses').insert(input);
  const { data, error } = await query.select('id').single();
  if (error) throw error;
  return data.id;
}

export async function deleteLicense(id: string) {
  const { error } = await supabase.from('driving_licenses').delete().eq('id', id);
  if (error) throw error;
}

export interface LicenseReading {
  last_name: string;
  first_name: string;
  birth_date: string | null;
  birth_place: string;
  license_number: string | null;
  issued_on: string | null;
  valid_until: string | null;
  categories: string[];
  confidence: 'haute' | 'moyenne' | 'faible';
}

/** Lecture du permis (recto et verso) par l'assistant (Edge Function « label-read »). */
export function readLicense(rectoFileId: string, versoFileId: string) {
  return invokeFunction<LicenseReading>('label-read', {
    file_id: rectoFileId,
    verso_file_id: versoFileId,
    kind: 'driving_license',
  });
}
