import type { InvoiceOverview } from '@/features/invoices/api';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesUpdate } from '@/types/database';

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
  const { data, error } = await supabase.from('v_clients_overview').select('*').order('name').limit(2000);
  if (error) throw error;
  return data as ClientOverview[];
}

export interface ClientDetail {
  client: ClientOverview;
  vehicles: VehicleOverview[];
  orders: RepairOrderOverview[];
  invoices: ClientInvoice[];
  quotes: ClientQuote[];
}

/** Fiche client : coordonnées, véhicules, OR, factures et devis. */
export async function fetchClient(id: string): Promise<ClientDetail | null> {
  const [client, vehicles, orders, invoices, quotes] = await Promise.all([
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
  ]);
  for (const result of [client, vehicles, orders, invoices, quotes]) if (result.error) throw result.error;
  if (!client.data) return null;
  return {
    client: client.data as ClientOverview,
    vehicles: (vehicles.data ?? []) as VehicleOverview[],
    orders: (orders.data ?? []) as RepairOrderOverview[],
    invoices: (invoices.data ?? []) as ClientInvoice[],
    quotes: quotes.data ?? [],
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
  const { data, error } = await supabase.from('v_vehicles_overview').select('*').order('plate').limit(3000);
  if (error) throw error;
  return data as VehicleOverview[];
}

export type VehicleOrderLine = Pick<
  Tables<'ro_lines'>,
  'repair_order_id' | 'kind' | 'line_type' | 'description'
>;

export interface VehicleDetail {
  vehicle: VehicleOverview;
  orders: RepairOrderOverview[];
  lines: VehicleOrderLine[];
  /** Numéros de facture par OR. */
  invoiceNumbers: Record<string, string[]>;
}

/** Fiche véhicule : identification, passages (du plus récent au plus ancien) et leurs travaux. */
export async function fetchVehicle(id: string): Promise<VehicleDetail | null> {
  const [vehicle, orders] = await Promise.all([
    supabase.from('v_vehicles_overview').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('v_repair_orders_overview')
      .select('*')
      .eq('vehicle_id', id)
      .order('created_at', { ascending: false }),
  ]);
  if (vehicle.error) throw vehicle.error;
  if (orders.error) throw orders.error;
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
    orders: orders.data as RepairOrderOverview[],
    lines: lines.data ?? [],
    invoiceNumbers,
  };
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
