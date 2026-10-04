import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/types/database';
import type { RepairOrderStatus, VehicleType } from './constants';
import { normalizeKey } from './constants';
import type { InspectionData } from './inspection';

type OverviewRow = Tables<'v_repair_orders_overview'>;
type Guaranteed =
  | 'id'
  | 'number'
  | 'status'
  | 'vehicle_id'
  | 'vehicle_type'
  | 'plate'
  | 'requested_work'
  | 'created_at'
  | 'worked_seconds'
  | 'declared_hours'
  | 'missing_photo_labels';

/** Ligne de la vue des OR ; les colonnes toujours renseignées sont typées non nulles. */
export type RepairOrderOverview = Omit<OverviewRow, Guaranteed> & {
  [K in Guaranteed]: NonNullable<OverviewRow[K]>;
};

export type RoLine = Tables<'ro_lines'>;
/** Photo de l'OR ; `author_name` : qui l'a prise (visionneuse). */
export type RoPhoto = Tables<'ro_photos'> & { author_name?: string | null };
export type RoEvent = Tables<'ro_events'> & { actor_name: string | null };
export type TimeEntry = Tables<'time_entries'>;

export interface RepairOrderDetail {
  order: RepairOrderOverview;
  lines: RoLine[];
  photos: RoPhoto[];
  inspection: InspectionData | null;
  timeEntries: TimeEntry[];
}

export interface TechnicianOption {
  id: string;
  display_name: string;
  color: string | null;
}

// ---------------------------------------------------------------- Lecture

export async function fetchRepairOrders(): Promise<RepairOrderOverview[]> {
  const { data, error } = await supabase
    .from('v_repair_orders_overview')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data as RepairOrderOverview[];
}

export async function fetchRepairOrder(id: string): Promise<RepairOrderDetail | null> {
  const [order, lines, photos, inspection, timeEntries] = await Promise.all([
    supabase.from('v_repair_orders_overview').select('*').eq('id', id).maybeSingle(),
    supabase.from('ro_lines').select('*').eq('repair_order_id', id).order('kind').order('position'),
    supabase
      .from('ro_photos')
      .select('*, author:profiles(full_name)')
      .eq('repair_order_id', id)
      .order('taken_at'),
    supabase.from('inspections').select('data').eq('repair_order_id', id).maybeSingle(),
    supabase.from('time_entries').select('*').eq('repair_order_id', id).order('started_at'),
  ]);
  for (const result of [order, lines, photos, inspection, timeEntries]) if (result.error) throw result.error;
  if (!order.data) return null;
  return {
    order: order.data as RepairOrderOverview,
    lines: lines.data ?? [],
    photos: (photos.data ?? []).map(({ author, ...photo }) => ({
      ...photo,
      author_name: author?.full_name ?? null,
    })),
    inspection: (inspection.data?.data as InspectionData | undefined) ?? null,
    timeEntries: timeEntries.data ?? [],
  };
}

/** Historique de l'OR (bureau uniquement), avec le nom de l'auteur. */
export async function fetchRepairOrderEvents(id: string): Promise<RoEvent[]> {
  const { data, error } = await supabase
    .from('ro_events')
    .select('*, actor:profiles(full_name)')
    .eq('repair_order_id', id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(({ actor, ...event }) => ({ ...event, actor_name: actor?.full_name ?? null }));
}

export async function fetchActiveTechnicians(): Promise<TechnicianOption[]> {
  const { data, error } = await supabase
    .from('technicians')
    .select('id, display_name, color')
    .eq('is_active', true)
    .order('sort_order')
    .order('display_name');
  if (error) throw error;
  return data;
}

export async function searchClients(query: string): Promise<{ id: string; name: string }[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .ilike('name', `%${term.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(8);
  if (error) throw error;
  return data;
}

export interface KnownVehicle {
  id: string;
  plate: string;
  vehicle_type: VehicleType;
  client_name: string | null;
  open_orders: { id: string; number: string; status: RepairOrderStatus }[];
}

/** Véhicule déjà connu pour cette plaque, avec ses OR non facturés (alerte de doublon). */
export async function findVehicleByPlate(plate: string): Promise<KnownVehicle | null> {
  const key = normalizeKey(plate);
  if (key.length < 4) return null;
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, plate, vehicle_type, client:clients(name), repair_orders(id, number, status)')
    .eq('plate_key', key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    plate: data.plate,
    vehicle_type: data.vehicle_type,
    client_name: data.client?.name ?? null,
    open_orders: data.repair_orders.filter((order) => order.status !== 'invoiced'),
  };
}

// ---------------------------------------------------------------- Écriture

export interface NewRepairOrderInput {
  plate: string;
  vehicle_type: VehicleType;
  client_name: string;
  requested_work: string;
  mileage: number | null;
  technician_id: string | null;
  planned_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  signature_file_id: string | null;
  /** Direction : fiche de contrôle complète exigée avant « Travaux terminés ». */
  inspection_required?: boolean;
}

export async function createRepairOrder(input: NewRepairOrderInput): Promise<Tables<'repair_orders'>> {
  const { data, error } = await supabase.rpc('create_repair_order', {
    p_plate: input.plate,
    p_vehicle_type: input.vehicle_type,
    p_client_name: input.client_name,
    p_requested_work: input.requested_work,
    p_mileage: input.mileage ?? undefined,
    p_technician_id: input.technician_id ?? undefined,
    p_planned_date: input.planned_date ?? undefined,
    p_planned_start: input.planned_start ?? undefined,
    p_planned_end: input.planned_end ?? undefined,
    p_signature_file_id: input.signature_file_id ?? undefined,
    p_inspection_required: input.inspection_required ?? false,
  });
  if (error) throw error;
  return data;
}

export async function updateRepairOrder(id: string, patch: TablesUpdate<'repair_orders'>) {
  const { data, error } = await supabase.from('repair_orders').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification non autorisée');
}

export async function deleteRepairOrder(id: string) {
  const { data, error } = await supabase.from('repair_orders').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression réservée à la direction');
}

/** Arrêt forcé du chrono par la direction (chrono resté actif sur un OR clôturé). */
export async function forceStopTimer(id: string) {
  const { error } = await supabase.rpc('stop_timer', { p_repair_order_id: id });
  if (error) throw error;
}
