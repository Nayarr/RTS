// Extrait de compte d'un client (relevé de factures) : une ligne par facture émise sur la période,
// avec véhicule, montants, réglé, reste dû et état ; avoirs en lignes négatives. Les états de
// règlement affichés se choisissent (impayées, partielles, payées), les totaux suivent le filtre.
import { todayIso } from '@/features/repair-orders/schemas';
import type { CreditNote, InvoiceOverview } from './api';

/** État de règlement d'une facture émise. */
export type Settlement = 'unpaid' | 'partial' | 'paid';

export const SETTLEMENTS: { value: Settlement; label: string; color: string }[] = [
  { value: 'unpaid', label: 'Impayées', color: '#B5453A' },
  { value: 'partial', label: 'Partielles', color: '#4750B5' },
  { value: 'paid', label: 'Payées', color: '#2A6B52' },
];

type SettlementFields = Pick<InvoiceOverview, 'paid_ttc' | 'balance_due'>;

/** Soldée (paiements et avoirs), payée en partie, ou rien de réglé. */
export function settlementOf(invoice: SettlementFields): Settlement {
  if ((invoice.balance_due ?? 0) <= 0.01) return 'paid';
  return (invoice.paid_ttc ?? 0) > 0 ? 'partial' : 'unpaid';
}

/** « Payée », « Partielle », « Impayée », avec « en retard » une fois l'échéance passée. */
export function settlementLabel(
  invoice: SettlementFields & Pick<InvoiceOverview, 'due_date'>,
  today = todayIso(),
): string {
  const settlement = settlementOf(invoice);
  if (settlement === 'paid') return 'Payée';
  const late = invoice.due_date !== null && invoice.due_date < today;
  if (settlement === 'partial') return late ? 'Partielle, en retard' : 'Partielle';
  return late ? 'En retard' : 'Impayée';
}

/** Véhicule de la facture (OR facturés) : plaque, marque, modèle. */
export interface StatementVehicle {
  plate: string | null;
  brand: string | null;
  model: string | null;
}

export interface StatementFilters {
  /** Date de la facture, du… au… (AAAA-MM-JJ, vide : sans limite). */
  from: string;
  to: string;
  settlements: Settlement[];
  /** Avoirs des factures affichées, en lignes négatives. */
  credits: boolean;
}

export interface StatementRow {
  key: string;
  kind: 'invoice' | 'credit';
  invoiceId: string;
  date: string;
  number: string;
  plate: string;
  brand: string;
  model: string;
  ht: number;
  vat: number;
  ttc: number;
  /** Paiements reçus (vide pour un avoir). */
  paid: number | null;
  /** Reste dû après paiements et avoirs (vide pour un avoir). */
  due: number | null;
  state: string;
}

export interface StatementTotals {
  ht: number;
  vat: number;
  ttc: number;
  paid: number;
  due: number;
}

const day = (value: string | null) => (value ?? '').slice(0, 10);
const round = (value: number) => Math.round(value * 100) / 100;

/** Factures émises du client retenues par le filtre (période, états de règlement). */
export function statementInvoices(invoices: InvoiceOverview[], filters: StatementFilters) {
  return invoices.filter((invoice) => {
    if (invoice.status !== 'issued') return false;
    const date = day(invoice.issued_at);
    return (
      (!filters.from || date >= filters.from) &&
      (!filters.to || date <= filters.to) &&
      filters.settlements.includes(settlementOf(invoice))
    );
  });
}

/** Lignes de l'extrait, par date de facture (avoirs à leur date). */
export function statementRows(
  invoices: InvoiceOverview[],
  creditNotes: CreditNote[],
  vehicles: Record<string, StatementVehicle>,
  filters: StatementFilters,
  today = todayIso(),
): StatementRow[] {
  const shown = statementInvoices(invoices, filters);
  const vehicleOf = (invoice: InvoiceOverview) => ({
    plate: vehicles[invoice.id]?.plate ?? invoice.vehicle_label ?? '',
    brand: vehicles[invoice.id]?.brand ?? '',
    model: vehicles[invoice.id]?.model ?? '',
  });
  const rows: StatementRow[] = shown.map((invoice) => ({
    key: invoice.id,
    kind: 'invoice',
    invoiceId: invoice.id,
    date: day(invoice.issued_at),
    number: invoice.number ?? '',
    ...vehicleOf(invoice),
    ht: invoice.total_ht,
    vat: invoice.total_vat,
    ttc: invoice.total_ttc,
    paid: invoice.paid_ttc ?? 0,
    due: invoice.balance_due ?? 0,
    state: settlementLabel(invoice, today),
  }));
  if (filters.credits) {
    const byId = new Map(shown.map((invoice) => [invoice.id, invoice]));
    for (const note of creditNotes) {
      const invoice = byId.get(note.invoice_id);
      if (!invoice) continue;
      rows.push({
        key: note.id,
        kind: 'credit',
        invoiceId: invoice.id,
        date: day(note.issued_at),
        number: note.number,
        ...vehicleOf(invoice),
        ht: -note.amount_ht,
        vat: -(note.total_vat ?? 0),
        ttc: -(note.total_ttc ?? 0),
        paid: null,
        due: null,
        state: `Avoir sur ${invoice.number ?? ''}`,
      });
    }
  }
  return sortStatement(rows, 'date', 'asc');
}

export function statementTotals(rows: StatementRow[]): StatementTotals {
  const sum = (pick: (row: StatementRow) => number | null) =>
    round(rows.reduce((total, row) => total + (pick(row) ?? 0), 0));
  return {
    ht: sum((row) => row.ht),
    vat: sum((row) => row.vat),
    ttc: sum((row) => row.ttc),
    paid: sum((row) => row.paid),
    due: sum((row) => row.due),
  };
}

export type StatementColumn =
  'date' | 'number' | 'plate' | 'brand' | 'model' | 'ht' | 'vat' | 'ttc' | 'paid' | 'due' | 'state';

export const STATEMENT_COLUMNS: { key: StatementColumn; label: string; amount?: boolean }[] = [
  { key: 'date', label: 'Date' },
  { key: 'number', label: 'N° facture' },
  { key: 'plate', label: 'Immat.' },
  { key: 'brand', label: 'Marque' },
  { key: 'model', label: 'Modèle' },
  { key: 'ht', label: 'Total HT', amount: true },
  { key: 'vat', label: 'TVA', amount: true },
  { key: 'ttc', label: 'Total TTC', amount: true },
  { key: 'paid', label: 'Réglé', amount: true },
  { key: 'due', label: 'Reste dû', amount: true },
  { key: 'state', label: 'État' },
];

/** Tri sur une colonne ; à égalité, par date puis par numéro (ordre stable). */
export function sortStatement(rows: StatementRow[], column: StatementColumn, direction: 'asc' | 'desc') {
  const factor = direction === 'asc' ? 1 : -1;
  const compare = (a: StatementRow, b: StatementRow) => {
    const left = a[column];
    const right = b[column];
    if (typeof left === 'number' || typeof right === 'number' || left === null || right === null)
      return ((left as number | null) ?? -Infinity) - ((right as number | null) ?? -Infinity);
    return left.localeCompare(right, 'fr', { numeric: true });
  };
  return [...rows].sort(
    (a, b) =>
      factor * compare(a, b) ||
      a.date.localeCompare(b.date) ||
      a.number.localeCompare(b.number, 'fr', { numeric: true }),
  );
}

/** Période imprimée : du… (début choisi ou première ligne) au… (fin choisie ou date d'édition). */
export function statementPeriod(rows: StatementRow[], filters: StatementFilters, today = todayIso()) {
  const first = rows.reduce<string | null>(
    (min, row) => (min === null || row.date < min ? row.date : min),
    null,
  );
  return { from: filters.from || first || today, to: filters.to || today };
}

/** N° client repris de l'ancien logiciel (« GTA-41100091 » → « 41100091 »). */
export const clientNumber = (legacyKey: string | null) =>
  legacyKey?.startsWith('GTA-') ? legacyKey.slice(4) : null;
