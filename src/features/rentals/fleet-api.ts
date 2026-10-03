import { supabase } from '@/lib/supabase';
import type { Database, Tables, TablesInsert } from '@/types/database';

export type FleetVehicle = Tables<'fleet_vehicles'>;
export type FleetVehicleInput = Omit<TablesInsert<'fleet_vehicles'>, 'id' | 'created_at' | 'updated_at'>;
export type FleetCategory = Database['public']['Enums']['fleet_category'];
export type FleetDocument = Tables<'fleet_documents'>;
export type FleetDocumentKind = Database['public']['Enums']['fleet_document_kind'];

/** Toute la flotte (véhicules retirés compris), par plaque. */
export async function fetchFleet(): Promise<FleetVehicle[]> {
  const { data, error } = await supabase.from('fleet_vehicles').select('*').order('plate');
  if (error) throw error;
  return data;
}

export async function fetchFleetVehicle(id: string): Promise<FleetVehicle | null> {
  const { data, error } = await supabase.from('fleet_vehicles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Création (sans id) ou modification ; renvoie l'identifiant du véhicule. */
export async function saveFleetVehicle(
  id: string | null,
  input: Partial<FleetVehicleInput>,
): Promise<string> {
  const query = id
    ? supabase.from('fleet_vehicles').update(input).eq('id', id)
    : supabase.from('fleet_vehicles').insert(input as FleetVehicleInput);
  const { data, error } = await query.select('id').single();
  if (error) {
    if (error.code === '23505') throw new Error('Cette immatriculation est déjà dans la flotte');
    throw error;
  }
  return data.id;
}

export async function fetchFleetDocuments(vehicleId: string): Promise<FleetDocument[]> {
  const { data, error } = await supabase
    .from('fleet_documents')
    .select('*')
    .eq('fleet_vehicle_id', vehicleId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function addFleetDocument(input: {
  fleet_vehicle_id: string;
  kind: FleetDocumentKind;
  label: string;
  file_id: string;
  valid_until?: string | null;
}) {
  const { error } = await supabase.from('fleet_documents').insert(input);
  if (error) throw error;
}

export async function deleteFleetDocument(id: string) {
  const { data, error } = await supabase.from('fleet_documents').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression non autorisée');
}
