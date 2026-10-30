import type { InvoiceOverview } from '@/features/invoices/api';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { fetchAllRows } from '@/lib/all-rows';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type ClientRow = Tables<'v_clients_overview'>;
type ClientGuaranteed =
  | 'id'
  | 'name'
  | 'created_at'
  | 'vehicles_count'
  | 'orders_count'
  | 'revenue_ht'
  | 'balance_due'
  | 'overdue_invoices_count';
export type ClientOverview = Omit<ClientRow, ClientGuaranteed> & {
  [K in ClientGuaranteed]: NonNullable<ClientRow[K]>;
};

type VehicleRow = Tables<'v_vehicles_overview'>;
type VehicleGuaranteed = 'id' | 'plate' | 'vehicle_type' | 'created_at' | 'orders_count';
export type VehicleOverview = Omit<VehicleRow, VehicleGuaranteed> & {
  [K in VehicleGuaranteed]: NonNullable<VehicleRow[K]>;
};

export type ClientInvoice = Pick<
  InvoiceOverview,
  'id' | 'number' | 'status' | 'issued_at' | 'total_ttc' | 'balance_due' | 'payment_status' | 'vehicle_label'
>;
export type ClientQuote = Pick<
  Tables<'v_quotes_overview'>,
  'id' | 'number' | 'status' | 'created_at' | 'total_ttc' | 'plate'
>;

// ---------------------------------------------------------------- Clients

export async function fetchClients(): Promise<ClientOverview[]> {
  const rows = await fetchAllRows((from, to) =>
    // Fiches archivées : hors de la liste (Réglages › Archives)
    supabase
      .from('v_clients_overview')
      .select('*')
      .is('archived_at', null)
      .order('name')
      .order('id')
      .range(from, to),
  );
  return rows as ClientOverview[];
}

export interface ClientDetail {
  client: ClientOverview;
  vehicles: VehicleOverview[];
  orders: RepairOrderOverview[];
  invoices: ClientInvoice[];
  quotes: ClientQuote[];
  /** Véhicules cédés à un autre client (dernier transfert de chacun). */
  transferred: TransferredVehicle[];
}

export interface TransferredVehicle {
  id: string;
  changed_at: string;
  to_client_name: string | null;
  vehicle: { id: string; plate: string };
}

/** Fiche client : coordonnées, véhicules, OR, factures et devis. */
export async function fetchClient(id: string): Promise<ClientDetail | null> {
  const [client, vehicles, orders, invoices, quotes, transferred] = await Promise.all([
    supabase.from('v_clients_overview').select('*').eq('id', id).maybeSingle(),
    supabase.from('v_vehicles_overview').select('*').eq('client_id', id).order('plate'),
    supabase
      .from('v_repair_orders_overview')
      .select('*')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('v_invoices_overview')
      .select('id, number, status, issued_at, total_ttc, balance_due, payment_status, vehicle_label')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('v_quotes_overview')
      .select('id, number, status, created_at, total_ttc, plate')
      .eq('client_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_owner_changes')
      .select('id, changed_at, to_client_name, vehicle:vehicles(id, plate)')
      .eq('from_client_id', id)
      .order('changed_at', { ascending: false }),
  ]);
  for (const result of [client, vehicles, orders, invoices, quotes, transferred]) {
    if (result.error) throw result.error;
  }
  if (!client.data) return null;
  return {
    client: client.data as ClientOverview,
    vehicles: (vehicles.data ?? []) as VehicleOverview[],
    orders: (orders.data ?? []) as RepairOrderOverview[],
    invoices: (invoices.data ?? []) as ClientInvoice[],
    quotes: quotes.data ?? [],
    // Dernier transfert de chaque véhicule, s'il n'est pas revenu au client depuis
    transferred: (transferred.data ?? []).filter(
      (change, index, all) =>
        all.findIndex((other) => other.vehicle.id === change.vehicle.id) === index &&
        !vehicles.data?.some((vehicle) => vehicle.id === change.vehicle.id),
    ),
  };
}

/** Sans droit (ou si le RLS ne modifie rien), on le signale au lieu d'un succès silencieux. */
const assertChanged = (result: { data: unknown[] | null; error: Error | null }, message: string) => {
  if (result.error) throw result.error;
  if (!result.data?.length) throw new Error(message);
};

const duplicateMessage = (error: unknown, message: string) =>
  error && typeof error === 'object' && 'code' in error && error.code === '23505'
    ? new Error(message)
    : error;

/** Nouveau client (pro ou particulier) ; renvoie son identifiant. */
export async function createClient(input: TablesInsert<'clients'>): Promise<string> {
  const { data, error } = await supabase.from('clients').insert(input).select('id').single();
  if (error) throw duplicateMessage(error, 'Un autre client porte déjà ce nom');
  return data.id;
}

export async function updateClient(id: string, patch: TablesUpdate<'clients'>) {
  const result = await supabase.from('clients').update(patch).eq('id', id).select('id');
  if (result.error) throw duplicateMessage(result.error, 'Un autre client porte déjà ce nom');
  assertChanged(result, 'Modification non autorisée');
}

export async function deleteClient(id: string) {
  const result = await supabase.from('clients').delete().eq('id', id).select('id');
  if (result.error?.code === '23503') {
    throw new Error('Ce client a des OR, devis ou factures : il ne peut pas être supprimé');
  }
  assertChanged(result, 'Suppression réservée à la direction');
}

// ---------------------------------------------------------------- Véhicules

export async function fetchVehicles(): Promise<VehicleOverview[]> {
  const rows = await fetchAllRows((from, to) =>
    supabase
      .from('v_vehicles_overview')
      .select('*')
      .is('archived_at', null)
      .order('plate')
      .order('id')
      .range(from, to),
  );
  return rows as VehicleOverview[];
}

// ---------------------------------------------------------------- Archives

export async function setClientArchived(id: string, archived: boolean) {
  const { error } = await supabase.rpc('set_client_archived', { p_client_id: id, p_archived: archived });
  if (error) throw error;
}

export async function setVehicleArchived(id: string, archived: boolean) {
  const { error } = await supabase.rpc('set_vehicle_archived', { p_vehicle_id: id, p_archived: archived });
  if (error) throw error;
}

export async function deleteVehicle(id: string) {
  const result = await supabase.from('vehicles').delete().eq('id', id).select('id');
  if (result.error?.code === '23503') {
    throw new Error('Ce véhicule a des OR, devis ou rendez-vous : archive-le plutôt');
  }
  assertChanged(result, 'Suppression réservée à la direction');
}

export interface Archives {
  clients: Pick<ClientOverview, 'id' | 'name' | 'archived_at' | 'vehicles_count'>[];
  vehicles: Pick<VehicleOverview, 'id' | 'plate' | 'brand' | 'model' | 'client_name' | 'archived_at'>[];
}

/** Fiches archivées, les plus récentes d'abord. */
export async function fetchArchives(): Promise<Archives> {
  const [clients, vehicles] = await Promise.all([
    supabase
      .from('v_clients_overview')
      .select('id, name, archived_at, vehicles_count')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(500),
    supabase
      .from('v_vehicles_overview')
      .select('id, plate, brand, model, client_name, archived_at')
      .not('archived_at', 'is', null)
      .order('archived_at', { ascending: false })
      .limit(500),
  ]);
  if (clients.error) throw clients.error;
  if (vehicles.error) throw vehicles.error;
  return { clients: clients.data as Archives['clients'], vehicles: vehicles.data as Archives['vehicles'] };
}

export type VehicleOrderLine = Pick<
  Tables<'ro_lines'>,
  'repair_order_id' | 'kind' | 'line_type' | 'description'
>;

export type VehicleOwnerChange = Pick<
  Tables<'vehicle_owner_changes'>,
  'id' | 'from_client_id' | 'from_client_name' | 'to_client_id' | 'to_client_name' | 'note' | 'changed_at'
>;

export interface VehicleDetail {
  vehicle: VehicleOverview;
  /** Propriétaires successifs, du plus ancien transfert au plus récent. */
  owners: VehicleOwnerChange[];
  orders: RepairOrderOverview[];
  lines: VehicleOrderLine[];
  /** Numéros de facture par OR. */
  invoiceNumbers: Record<string, string[]>;
}

/** Fiche véhicule : identification, passages (du plus récent au plus ancien) et leurs travaux. */
export async function fetchVehicle(id: string): Promise<VehicleDetail | null> {
  const [vehicle, orders, owners] = await Promise.all([
    supabase.from('v_vehicles_overview').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('v_repair_orders_overview')
      .select('*')
      .eq('vehicle_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_owner_changes')
      .select('id, from_client_id, from_client_name, to_client_id, to_client_name, note, changed_at')
      .eq('vehicle_id', id)
      .order('changed_at'),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (orders.error) throw orders.error;
  if (owners.error) throw owners.error;
  if (!vehicle.data) return null;
  const orderIds = orders.data.flatMap((order) => (order.id ? [order.id] : []));
  const [lines, invoices] = orderIds.length
    ? await Promise.all([
        supabase
          .from('ro_lines')
          .select('repair_order_id, kind, line_type, description')
          .in('repair_order_id', orderIds)
          .eq('kind', 'done')
          .order('position'),
        supabase
          .from('invoice_repair_orders')
          .select('repair_order_id, invoice:invoices(number, status)')
          .in('repair_order_id', orderIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (lines.error) throw lines.error;
  if (invoices.error) throw invoices.error;

  const invoiceNumbers: Record<string, string[]> = {};
  for (const link of invoices.data ?? []) {
    if (link.invoice.status !== 'issued' || !link.invoice.number) continue;
    (invoiceNumbers[link.repair_order_id] ??= []).push(link.invoice.number);
  }
  return {
    vehicle: vehicle.data as VehicleOverview,
    owners: owners.data,
    orders: orders.data as RepairOrderOverview[],
    lines: lines.data ?? [],
    invoiceNumbers,
  };
}

/** Véhicule racheté par un autre client : il passe chez lui, son historique reste sur sa fiche. */
export async function transferVehicle(vehicleId: string, clientId: string, note: string) {
  const { error } = await supabase.rpc('transfer_vehicle', {
    p_vehicle_id: vehicleId,
    p_client_id: clientId,
    p_note: note.trim() || undefined,
  });
  if (error) throw error;
}

export async function updateVehicle(id: string, patch: TablesUpdate<'vehicles'>) {
  const result = await supabase.from('vehicles').update(patch).eq('id', id).select('id');
  if (result.error) throw duplicateMessage(result.error, 'Cette immatriculation existe déjà');
  assertChanged(result, 'Modification non autorisée');
}

export type VehicleDeadline = Tables<'v_vehicle_deadlines'>;

/** Échéances dépassées ou dans les 30 jours (contrôle technique, hayon). */
export async function fetchDeadlines(): Promise<VehicleDeadline[]> {
  const { data, error } = await supabase.from('v_vehicle_deadlines').select('*').order('due_date');
  if (error) throw error;
  return data;
}

/** Relance notée (page Échéances) : refusée pour un véhicule déjà relancé depuis moins de 3 mois. */
export async function recordDeadlineReminders(items: { vehicle_id: string; kind: string }[]): Promise<void> {
  const { error } = await supabase.rpc('record_deadline_reminders', { p_items: items });
  if (error) throw error;
}
