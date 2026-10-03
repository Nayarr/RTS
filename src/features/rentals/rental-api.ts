import { supabase } from '@/lib/supabase';
import type { SignatureRequest } from '@/features/signature/api';
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database';
import type { DrivingLicense } from './license-api';
import type { FleetVehicle } from './fleet-api';

type Enums = Database['public']['Enums'];
export type RentalKind = Enums['rental_kind'];
export type RentalStatus = Enums['rental_status'];
export type RentalPhase = Enums['rental_phase'];
export type PhotoSlot = Enums['rental_photo_slot'];
export type Rental = Tables<'rentals'>;
/** Le numéro (LC-/PR-) est attribué par la base. */
export type RentalInput = Omit<TablesInsert<'rentals'>, 'number'>;
export type RentalInspection = Tables<'rental_inspections'>;
export type RentalPhoto = Tables<'rental_photos'>;
export type RentalDamage = Tables<'rental_damages'>;

/** Ligne de la vue v_rentals_overview : le contrat, son client et son véhicule. */
export type RentalOverview = Rental & {
  client_name: string;
  client_kind: Enums['client_kind'];
  client_phone: string | null;
  plate: string;
  brand: string;
  model: string;
  category: Enums['fleet_category'];
  repair_order_number: string | null;
  invoice_number: string | null;
  /** Véhicule sorti au-delà du retour prévu. */
  is_late: boolean;
  estimated_ht: number;
};

export async function fetchRentals(): Promise<RentalOverview[]> {
  const { data, error } = await supabase
    .from('v_rentals_overview')
    .select('*')
    .order('departure_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data as RentalOverview[];
}

export interface RentalDetail {
  rental: RentalOverview;
  vehicle: FleetVehicle;
  license: DrivingLicense | null;
  /** Permis enregistrés pour le client (le sien ou ceux de ses conducteurs). */
  licenses: DrivingLicense[];
  client: Pick<
    Tables<'clients'>,
    'id' | 'name' | 'kind' | 'phone' | 'email' | 'billing_address' | 'first_name' | 'last_name'
  >;
  inspections: RentalInspection[];
  photos: RentalPhoto[];
  damages: RentalDamage[];
}

/** Contrat complet : client, véhicule, permis, états des lieux, photos et dommages. */
export async function fetchRental(id: string): Promise<RentalDetail | null> {
  const rental = await supabase.from('v_rentals_overview').select('*').eq('id', id).maybeSingle();
  if (rental.error) throw rental.error;
  if (!rental.data) return null;
  const row = rental.data as RentalOverview;
  const [vehicle, licenses, client, inspections, photos, damages] = await Promise.all([
    supabase.from('fleet_vehicles').select('*').eq('id', row.fleet_vehicle_id).single(),
    supabase.from('driving_licenses').select('*').eq('client_id', row.client_id).order('created_at'),
    supabase
      .from('clients')
      .select('id, name, kind, phone, email, billing_address, first_name, last_name')
      .eq('id', row.client_id)
      .single(),
    supabase.from('rental_inspections').select('*').eq('rental_id', id),
    supabase.from('rental_photos').select('*').eq('rental_id', id).order('created_at'),
    supabase.from('rental_damages').select('*').eq('rental_id', id).order('created_at'),
  ]);
  for (const result of [vehicle, licenses, client, inspections, photos, damages]) {
    if (result.error) throw result.error;
  }
  const allLicenses = licenses.data ?? [];
  return {
    rental: row,
    vehicle: vehicle.data as FleetVehicle,
    license: allLicenses.find((license) => license.id === row.driving_license_id) ?? null,
    licenses: allLicenses,
    client: client.data as RentalDetail['client'],
    inspections: inspections.data ?? [],
    photos: photos.data ?? [],
    damages: damages.data ?? [],
  };
}

/** Périodes déjà réservées ou en cours, pour le choix du véhicule. */
export async function fetchBusyPeriods(): Promise<
  Pick<Rental, 'id' | 'fleet_vehicle_id' | 'departure_at' | 'planned_return_at' | 'number' | 'kind'>[]
> {
  const { data, error } = await supabase
    .from('rentals')
    .select('id, fleet_vehicle_id, departure_at, planned_return_at, number, kind')
    .in('status', ['reserved', 'active']);
  if (error) throw error;
  return data;
}

const overlapMessage = (error: { code?: string; message: string }) =>
  new Error(
    error.code === '23P01' ? 'Ce véhicule est déjà réservé ou sorti sur cette période' : error.message,
  );

export async function createRental(input: RentalInput): Promise<string> {
  const { data, error } = await supabase
    .from('rentals')
    .insert({ ...input, number: '' })
    .select('id')
    .single();
  if (error) throw overlapMessage(error);
  return data.id;
}

export async function updateRental(id: string, patch: TablesUpdate<'rentals'>) {
  const { error } = await supabase.from('rentals').update(patch).eq('id', id);
  if (error) throw overlapMessage(error);
}

/** Relevés d'un état des lieux (créé au premier enregistrement). */
export async function saveInspection(
  rentalId: string,
  phase: RentalPhase,
  patch: Pick<
    TablesUpdate<'rental_inspections'>,
    'mileage' | 'fuel_eighths' | 'equipment' | 'clean' | 'notes'
  >,
) {
  const { error } = await supabase
    .from('rental_inspections')
    .upsert({ rental_id: rentalId, phase, ...patch }, { onConflict: 'rental_id,phase' });
  if (error) throw error;
}

/** Photo d'un côté du véhicule : remplace la précédente (les gros plans s'ajoutent). */
export async function setRentalPhoto(rentalId: string, phase: RentalPhase, slot: PhotoSlot, fileId: string) {
  if (slot !== 'closeup') {
    const removed = await supabase.from('rental_photos').delete().match({ rental_id: rentalId, phase, slot });
    if (removed.error) throw removed.error;
  }
  const { error } = await supabase
    .from('rental_photos')
    .insert({ rental_id: rentalId, phase, slot, file_id: fileId });
  if (error) throw error;
}

export async function deleteRentalPhoto(id: string) {
  const { error } = await supabase.from('rental_photos').delete().eq('id', id);
  if (error) throw error;
}

export async function addDamage(input: TablesInsert<'rental_damages'>) {
  const { error } = await supabase.from('rental_damages').insert(input);
  if (error) throw error;
}

export async function deleteDamage(id: string) {
  const { error } = await supabase.from('rental_damages').delete().eq('id', id);
  if (error) throw error;
}

/** Ce qui manque encore pour remettre les clés ou enregistrer le retour (règles de la base). */
export async function fetchMissing(rentalId: string, phase: RentalPhase): Promise<string[]> {
  const { data, error } = await supabase.rpc('rental_missing', { p_rental_id: rentalId, p_phase: phase });
  if (error) throw error;
  return data ?? [];
}

export async function startRental(rentalId: string) {
  const { error } = await supabase.rpc('start_rental', { p_rental_id: rentalId });
  if (error) throw error;
}

export async function returnRental(rentalId: string, returnedAt: string) {
  const { error } = await supabase.rpc('return_rental', { p_rental_id: rentalId, p_returned_at: returnedAt });
  if (error) throw error;
}

export type InvoiceLineDraft = {
  description: string;
  quantity: number;
  unit_price: number;
};

/** Clôture : facture en brouillon avec les lignes retenues (aucune : clôturé sans facture). */
export async function closeRental(rentalId: string, lines: InvoiceLineDraft[]): Promise<string | null> {
  const { data, error } = await supabase.rpc('close_rental', { p_rental_id: rentalId, p_lines: lines });
  if (error) throw error;
  return data ?? null;
}

export async function cancelRental(rentalId: string) {
  const { error } = await supabase.rpc('cancel_rental', { p_rental_id: rentalId });
  if (error) throw error;
}

/** Prêts rattachés à un OR (véhicule de courtoisie pendant l'intervention). */
export async function fetchRepairOrderLoans(repairOrderId: string): Promise<RentalOverview[]> {
  const { data, error } = await supabase
    .from('v_rentals_overview')
    .select('*')
    .eq('repair_order_id', repairOrderId)
    .neq('status', 'cancelled')
    .order('departure_at', { ascending: false });
  if (error) throw error;
  return data as RentalOverview[];
}

// ---------------------------------------------------------------- Envoi au client

/** Lien de signature à distance (valable 7 jours ; un lien encore valable est repris). */
export async function requestRentalSignature(id: string): Promise<SignatureRequest> {
  const { data, error } = await supabase.rpc('request_rental_signature', { p_rental_id: id });
  if (error) throw error;
  return data as unknown as SignatureRequest;
}

/** Dernière demande de signature à distance du contrat, ou null. */
export async function fetchRentalSignatureRequest(id: string): Promise<SignatureRequest | null> {
  const { data, error } = await supabase.rpc('rental_signature_request', { p_rental_id: id });
  if (error) throw error;
  return (data as unknown as SignatureRequest | null) ?? null;
}

/** Lien de consultation du contrat (créé au premier envoi). */
export async function shareRental(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('share_rental', { p_rental_id: id });
  if (error) throw error;
  return data;
}
