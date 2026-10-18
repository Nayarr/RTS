import { supabase } from '@/lib/supabase';
import type { Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database';

export type PaymentMethod = Enums<'payment_method'>;
export type VehicleType = Enums<'vehicle_type'>;
export type InvoiceLine = Tables<'invoice_lines'>;
export type Payment = Tables<'payments'>;
export type CreditNote = Tables<'credit_notes'>;
export type PaymentStatus = 'paid' | 'pending' | 'partial' | 'overdue';

type OverviewRow = Tables<'v_invoices_overview'>;
type Guaranteed =
  | 'id'
  | 'status'
  | 'client_id'
  | 'created_at'
  | 'total_ht'
  | 'total_vat'
  | 'total_ttc'
  | 'repair_order_ids'
  | 'repair_order_numbers'
  | 'reminders_count';

/** Facture (brouillon ou émise) avec totaux, reste dû et OR concernés. */
export type InvoiceOverview = Omit<OverviewRow, Guaranteed | 'payment_status'> & {
  [K in Guaranteed]: NonNullable<OverviewRow[K]>;
} & { payment_status: PaymentStatus | null };

export interface ClientBilling {
  name: string;
  billing_address: string | null;
  siret: string | null;
  email: string | null;
}

export interface InvoiceDetail {
  invoice: InvoiceOverview;
  lines: InvoiceLine[];
  payments: Payment[];
  creditNotes: CreditNote[];
  /** Fiche client actuelle (brouillon : coordonnées reprises à l'émission). */
  client: ClientBilling;
  vehicleType: VehicleType;
  laborRate: number;
  clientDiscount: number;
}

export type CreditNoteOverview = CreditNote & {
  invoice_number: string | null;
  client_name: string | null;
  vehicle_label: string | null;
};

// ---------------------------------------------------------------- Lecture

export async function fetchInvoices(): Promise<InvoiceOverview[]> {
  const { data, error } = await supabase
    .from('v_invoices_overview')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return data as InvoiceOverview[];
}

export async function fetchRepairOrderInvoices(repairOrderId: string): Promise<InvoiceOverview[]> {
  const { data, error } = await supabase
    .from('v_invoices_overview')
    .select('*')
    .contains('repair_order_ids', [repairOrderId])
    .order('created_at');
  if (error) throw error;
  return data as InvoiceOverview[];
}

export async function fetchInvoice(id: string): Promise<InvoiceDetail | null> {
  const [invoice, lines, payments, creditNotes] = await Promise.all([
    supabase.from('v_invoices_overview').select('*').eq('id', id).maybeSingle(),
    supabase.from('invoice_lines').select('*').eq('invoice_id', id).order('position'),
    supabase.from('payments').select('*').eq('invoice_id', id).order('paid_on'),
    supabase.from('credit_notes').select('*').eq('invoice_id', id).order('issued_at'),
  ]);
  for (const result of [invoice, lines, payments, creditNotes]) if (result.error) throw result.error;
  if (!invoice.data) return null;
  const overview = invoice.data as InvoiceOverview;

  const [client, order] = await Promise.all([
    supabase
      .from('clients')
      .select('name, billing_address, siret, email, discount_percent')
      .eq('id', overview.client_id)
      .single(),
    overview.repair_order_ids[0]
      ? supabase.from('repair_orders').select('vehicle_type').eq('id', overview.repair_order_ids[0]).single()
      : Promise.resolve({ data: { vehicle_type: 'pl' as const }, error: null }),
  ]);
  if (client.error) throw client.error;
  if (order.error) throw order.error;
  const rate = await supabase.rpc('labor_rate_for', {
    p_client_id: overview.client_id,
    p_vehicle_type: order.data.vehicle_type,
  });
  if (rate.error) throw rate.error;

  const { discount_percent, ...billing } = client.data;
  return {
    invoice: overview,
    lines: lines.data ?? [],
    payments: payments.data ?? [],
    creditNotes: creditNotes.data ?? [],
    client: billing,
    vehicleType: order.data.vehicle_type,
    laborRate: rate.data,
    clientDiscount: discount_percent ?? 0,
  };
}

export async function fetchCreditNotes(): Promise<CreditNoteOverview[]> {
  const { data, error } = await supabase
    .from('credit_notes')
    .select('*, invoice:invoices(number, client_name, vehicle_label)')
    .order('issued_at', { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data.map(({ invoice, ...note }) => ({
    ...note,
    invoice_number: invoice.number,
    client_name: invoice.client_name,
    vehicle_label: invoice.vehicle_label,
  }));
}

export interface BillableOrder {
  id: string;
  number: string;
  plate: string;
  status: Enums<'repair_order_status'>;
  client_id: string;
  client_name: string;
}

/** OR non facturés (facture groupée : même client). */
export async function fetchBillableOrders(): Promise<BillableOrder[]> {
  const { data, error } = await supabase
    .from('v_repair_orders_overview')
    .select('id, number, plate, status, client_id, client_name')
    .neq('status', 'invoiced')
    .not('client_id', 'is', null)
    .order('number');
  if (error) throw error;
  return data as BillableOrder[];
}

// ---------------------------------------------------------------- Brouillon

/** Brouillon pré-rempli depuis un ou plusieurs OR du même client (repris s'il existe déjà). */
export async function buildInvoiceDraft(repairOrderIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('build_invoice_draft', { p_repair_order_ids: repairOrderIds });
  if (error) throw error;
  return data;
}

/** Copie de la facture en brouillon, rattachée aux mêmes OR ; renvoie son identifiant. */
export async function duplicateInvoice(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_invoice', { p_invoice_id: id });
  if (error) throw error;
  return data;
}

export async function deleteInvoiceDraft(id: string) {
  const { data, error } = await supabase.from('invoices').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression impossible');
}

/** Repart des OR : le brouillon est remplacé par un nouveau, construit avec leurs données actuelles. */
export async function rebuildInvoiceDraft(id: string, repairOrderIds: string[]): Promise<string> {
  await deleteInvoiceDraft(id);
  return buildInvoiceDraft(repairOrderIds);
}

export async function updateInvoiceDraft(id: string, patch: TablesUpdate<'invoices'>) {
  const { data, error } = await supabase.from('invoices').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification impossible');
}

export type NewInvoiceLine = Omit<TablesInsert<'invoice_lines'>, 'invoice_id'>;

export async function addInvoiceLine(invoiceId: string, line: NewInvoiceLine) {
  const { error } = await supabase.from('invoice_lines').insert({ ...line, invoice_id: invoiceId });
  if (error) throw error;
}

export async function updateInvoiceLine(id: string, patch: TablesUpdate<'invoice_lines'>) {
  const { data, error } = await supabase.from('invoice_lines').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Modification impossible');
}

export async function deleteInvoiceLine(id: string) {
  const { data, error } = await supabase.from('invoice_lines').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data.length) throw new Error('Suppression impossible');
}

/** Coordonnées de facturation gardées sur la fiche client (reprises à l'émission). */
export async function updateClientBilling(
  clientId: string,
  billing: Pick<ClientBilling, 'billing_address' | 'siret' | 'email'>,
) {
  const { error } = await supabase.from('clients').update(billing).eq('id', clientId);
  if (error) throw error;
}

/** Émission définitive : numéro, instantané client, totaux figés, OR « Facturé ». */
export async function issueInvoice(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('issue_invoice', { p_invoice_id: id });
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Encaissements et avoirs

export interface PaymentInput {
  amount_ttc: number;
  method: PaymentMethod;
  paid_on: string;
  note: string | null;
}

export async function addPayment(invoiceId: string, input: PaymentInput) {
  const { error } = await supabase.from('payments').insert({ ...input, invoice_id: invoiceId });
  if (error) throw error;
}

export interface CreditNoteInput {
  amount_ht: number;
  vat_rate: number;
  reason: string | null;
}

/** Avoir numéroté par la base ; renvoyé pour son PDF. */
export async function addCreditNote(invoiceId: string, input: CreditNoteInput): Promise<CreditNote> {
  const { data, error } = await supabase
    .from('credit_notes')
    // Le numéro (AV1, AV2…) est attribué par la base à l'insertion.
    .insert({ ...input, invoice_id: invoiceId, number: '' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- Envoi et relances

/** Lien de consultation en ligne d'une facture émise. Renvoie le jeton. */
export async function shareInvoice(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('share_invoice', { p_invoice_id: id });
  if (error) throw error;
  return data;
}

/** Relance tracée (date, auteur, historique des OR). */
export async function recordInvoiceReminder(id: string) {
  const { error } = await supabase.rpc('record_invoice_reminder', { p_invoice_id: id });
  if (error) throw error;
}
