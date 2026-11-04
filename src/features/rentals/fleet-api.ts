import { invokeFunction } from '@/lib/functions';
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

// ---------------------------------------------------------------- Vente

export type FleetVatScheme = 'normal' | 'margin';

/** Vente d'un véhicule, avec l'acheteur (pour le certificat de cession) et la facture. */
export type FleetSale = Tables<'fleet_vehicle_sales'> & {
  client: Pick<
    Tables<'clients'>,
    'name' | 'kind' | 'siret' | 'billing_address' | 'civility' | 'birth_date' | 'birth_place'
  > | null;
  invoice: Pick<Tables<'invoices'>, 'number' | 'status'> | null;
};

export async function fetchFleetSale(vehicleId: string): Promise<FleetSale | null> {
  const { data, error } = await supabase
    .from('fleet_vehicle_sales')
    .select(
      '*, client:clients(name, kind, siret, billing_address, civility, birth_date, birth_place), invoice:invoices(number, status)',
    )
    .eq('fleet_vehicle_id', vehicleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Vend le véhicule : sortie de la flotte et facture en brouillon, dont l'identifiant est renvoyé. */
export async function sellFleetVehicle(input: {
  vehicleId: string;
  clientId: string;
  soldAt: string;
  mileage: number | null;
  scheme: FleetVatScheme;
  price: number;
  purchasePrice: number | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('sell_fleet_vehicle', {
    p_vehicle_id: input.vehicleId,
    p_client_id: input.clientId,
    p_sold_at: input.soldAt,
    p_mileage: input.mileage as number,
    p_vat_scheme: input.scheme,
    p_price: input.price,
    ...(input.purchasePrice === null ? {} : { p_purchase_price: input.purchasePrice }),
  });
  if (error) throw error;
  return data;
}

export async function cancelFleetSale(vehicleId: string) {
  const { error } = await supabase.rpc('cancel_fleet_vehicle_sale', { p_vehicle_id: vehicleId });
  if (error) throw error;
}

/** Carte grise lue par l'assistant (Edge Function « label-read ») : valeurs à vérifier. */
export interface RegistrationReading {
  plate: string | null;
  first_registration: string | null;
  brand: string | null;
  model: string | null;
  vin: string | null;
  category: FleetCategory | null;
  fuel_type: string | null;
  confidence: 'haute' | 'moyenne' | 'faible';
}

export function readRegistration(fileId: string) {
  return invokeFunction<RegistrationReading>('label-read', { file_id: fileId, kind: 'registration_card' });
}
