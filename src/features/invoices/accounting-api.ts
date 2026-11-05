import { fetchAllRows } from '@/lib/all-rows';
import { supabase } from '@/lib/supabase';
import type { InvoiceOverview } from './api';
import type { AccountingCreditNote, AccountingData, AccountingPayment } from './accounting-export';
import { fetchInvoicesLines } from './statement-api';

/** Début d'un jour à l'heure de l'ordinateur (bureau en France), pour comparer un horodatage. */
const dayStart = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const nextDayStart = (day: string) => {
  const next = new Date(`${day}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return next.toISOString();
};

async function fetchPayments(from: string, to: string, clientId: string): Promise<AccountingPayment[]> {
  const rows = await fetchAllRows((start, end) => {
    let query = supabase
      .from('payments')
      .select(
        '*, recorder:profiles!payments_recorded_by_fkey(full_name), invoice:invoices!inner(number, client_id, client_name, total_ht, total_vat, total_ttc)',
      );
    if (from) query = query.gte('paid_on', from);
    if (to) query = query.lte('paid_on', to);
    if (clientId) query = query.eq('invoice.client_id', clientId);
    return query.order('paid_on').order('id').range(start, end);
  });
  return rows.map(({ recorder, invoice, ...payment }) => ({
    id: payment.id,
    invoice_id: payment.invoice_id,
    paid_on: payment.paid_on,
    method: payment.method,
    amount_ttc: payment.amount_ttc,
    note: payment.note,
    recorder_name: recorder?.full_name ?? null,
    invoice_number: invoice.number,
    client_id: invoice.client_id,
    client_name: invoice.client_name,
    invoice_ht: invoice.total_ht ?? 0,
    invoice_vat: invoice.total_vat ?? 0,
    invoice_ttc: invoice.total_ttc ?? 0,
  }));
}

async function fetchCreditNotes(from: string, to: string, clientId: string): Promise<AccountingCreditNote[]> {
  const rows = await fetchAllRows((start, end) => {
    let query = supabase
      .from('credit_notes')
      .select('*, invoice:invoices!inner(number, client_id, client_name, vehicle_label)');
    if (from) query = query.gte('issued_at', dayStart(from));
    if (to) query = query.lt('issued_at', nextDayStart(to));
    if (clientId) query = query.eq('invoice.client_id', clientId);
    return query.order('issued_at').order('id').range(start, end);
  });
  return rows.map(({ invoice, ...note }) => ({
    id: note.id,
    number: note.number,
    issued_at: note.issued_at,
    reason: note.reason,
    amount_ht: note.amount_ht,
    vat_rate: note.vat_rate,
    total_vat: note.total_vat,
    total_ttc: note.total_ttc,
    invoice_number: invoice.number,
    client_id: invoice.client_id,
    client_name: invoice.client_name,
    vehicle_label: invoice.vehicle_label,
  }));
}

async function fetchMarginRates(invoices: InvoiceOverview[]) {
  const rates = new Map<string, number>();
  const ids = invoices.filter((invoice) => invoice.vat_scheme === 'margin').map((invoice) => invoice.id);
  if (ids.length === 0) return rates;
  const { data, error } = await supabase.from('invoices').select('id, margin_vat_rate').in('id', ids);
  if (error) throw error;
  for (const row of data) if (row.margin_vat_rate !== null) rates.set(row.id, row.margin_vat_rate);
  return rates;
}

/** Tout ce qu'il faut à la comptabilité sur une période : les paiements et avoirs comptent à leur propre date. */
export async function fetchAccountingData({
  from,
  to,
  clientId,
  invoices,
}: {
  from: string;
  to: string;
  clientId: string;
  invoices: InvoiceOverview[];
}): Promise<AccountingData> {
  const [lines, payments, creditNotes, marginRates] = await Promise.all([
    fetchInvoicesLines(invoices.map((invoice) => invoice.id)),
    fetchPayments(from, to, clientId),
    fetchCreditNotes(from, to, clientId),
    fetchMarginRates(invoices),
  ]);
  return { from, to, invoices, lines, payments, creditNotes, marginRates };
}
