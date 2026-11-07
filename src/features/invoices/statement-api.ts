import { fetchAllRows } from '@/lib/all-rows';
import { supabase } from '@/lib/supabase';
import type { CreditNote, InvoiceLine, InvoiceOverview } from './api';
import type { DuesClient } from './dues';
import type { StatementVehicle } from './statement';

/** Identifiants par paquets (adresse de la requête courte). */
const CHUNK = 100;
const chunks = <T>(items: T[]) =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) =>
    items.slice(index * CHUNK, (index + 1) * CHUNK),
  );

export interface StatementClient {
  id: string;
  name: string;
  billing_address: string | null;
  siret: string | null;
  legacy_key: string | null;
}

export interface ClientStatement {
  client: StatementClient;
  invoices: InvoiceOverview[];
  creditNotes: CreditNote[];
  vehicles: Record<string, StatementVehicle>;
}

/** Véhicule de chaque facture : celui des OR facturés (plusieurs : plaque de la facture, marque commune). */
export async function fetchInvoiceVehicles(invoiceIds: string[]): Promise<Record<string, StatementVehicle>> {
  const found = new Map<string, StatementVehicle[]>();
  for (const ids of chunks(invoiceIds)) {
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from('invoice_repair_orders')
        .select(
          'invoice_id, repair_order_id, repair_order:repair_orders(vehicle:vehicles(plate, brand, model))',
        )
        .in('invoice_id', ids)
        .order('invoice_id')
        .order('repair_order_id')
        .range(from, to),
    );
    for (const row of rows) {
      const vehicle = row.repair_order?.vehicle;
      if (!vehicle) continue;
      const list = found.get(row.invoice_id) ?? [];
      if (!list.some((known) => known.plate === vehicle.plate)) list.push(vehicle);
      found.set(row.invoice_id, list);
    }
  }
  const vehicles: Record<string, StatementVehicle> = {};
  for (const [invoiceId, list] of found) {
    const [first] = list;
    if (!first) continue;
    const same = (pick: (vehicle: StatementVehicle) => string | null) =>
      list.every((vehicle) => pick(vehicle) === pick(first)) ? pick(first) : null;
    vehicles[invoiceId] =
      list.length === 1 ? first : { plate: null, brand: same((v) => v.brand), model: same((v) => v.model) };
  }
  return vehicles;
}

/** Lignes des factures, dans l'ordre de chaque facture. */
export async function fetchInvoicesLines(invoiceIds: string[]): Promise<Map<string, InvoiceLine[]>> {
  const lines = new Map<string, InvoiceLine[]>();
  for (const ids of chunks(invoiceIds)) {
    const rows = await fetchAllRows((from, to) =>
      supabase
        .from('invoice_lines')
        .select('*')
        .in('invoice_id', ids)
        .order('invoice_id')
        .order('position')
        .order('id')
        .range(from, to),
    );
    for (const line of rows) lines.set(line.invoice_id, [...(lines.get(line.invoice_id) ?? []), line]);
  }
  return lines;
}

/** Avoirs des factures. */
export async function fetchInvoicesCreditNotes(invoiceIds: string[]): Promise<CreditNote[]> {
  const notes: CreditNote[] = [];
  for (const ids of chunks(invoiceIds)) {
    const { data, error } = await supabase
      .from('credit_notes')
      .select('*')
      .in('invoice_id', ids)
      .order('issued_at')
      .order('id');
    if (error) throw error;
    notes.push(...data);
  }
  return notes;
}

/** Extrait de compte : client, factures émises, avoirs, véhicules. */
export async function fetchClientStatement(clientId: string): Promise<ClientStatement | null> {
  const [client, invoices] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, billing_address, siret, legacy_key')
      .eq('id', clientId)
      .maybeSingle(),
    fetchAllRows((from, to) =>
      supabase
        .from('v_invoices_overview')
        .select('*')
        .eq('client_id', clientId)
        .eq('status', 'issued')
        .order('issued_at')
        .order('id')
        .range(from, to),
    ),
  ]);
  if (client.error) throw client.error;
  if (!client.data) return null;
  const list = invoices as InvoiceOverview[];
  const ids = list.map((invoice) => invoice.id);
  const [creditNotes, vehicles] = await Promise.all([
    fetchInvoicesCreditNotes(ids),
    fetchInvoiceVehicles(ids),
  ]);
  return { client: client.data, invoices: list, creditNotes, vehicles };
}

/**
 * Sommes dues : factures émises encore à régler (reste dû lu maintenant), leurs clients et véhicules.
 * La période et les types de compte se choisissent ensuite (`duesByClient`).
 */
export async function fetchDues() {
  const invoices = (await fetchAllRows((start, end) =>
    supabase
      .from('v_invoices_overview')
      .select('*')
      .eq('status', 'issued')
      .gt('balance_due', 0.01)
      .order('issued_at')
      .order('id')
      .range(start, end),
  )) as InvoiceOverview[];
  const clientIds = [
    ...new Set(invoices.flatMap((invoice) => (invoice.client_id ? [invoice.client_id] : []))),
  ];
  const clients: DuesClient[] = [];
  for (const ids of chunks(clientIds)) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, billing_address, siret, legacy_key, account_type, direct_debit_day')
      .in('id', ids);
    if (error) throw error;
    clients.push(...data);
  }
  const vehicles = await fetchInvoiceVehicles(invoices.map((invoice) => invoice.id));
  return { invoices, clients, vehicles };
}
