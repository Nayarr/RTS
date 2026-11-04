import { lineNet } from '@/features/documents/lines';
import type { CsvCell } from '@/lib/csv';
import type { InvoiceLine, InvoiceOverview, PaymentMethod } from './api';
import { PAYMENT_METHODS, PAYMENT_STATUS_META } from './domain';

/**
 * Export pour la comptabilité : classeur de 7 onglets (Excel, ou un CSV par onglet), montants en
 * nombres et dates en dates pour pouvoir trier, filtrer et faire des tableaux croisés.
 * Comptes du plan comptable général proposés : à valider ou adapter par le cabinet comptable.
 */
export type ColumnKind = 'text' | 'money' | 'date' | 'integer' | 'decimal';
export type SheetCell = string | number | null;
export interface SheetColumn {
  header: string;
  kind: ColumnKind;
  /** Largeur Excel, en caractères. */
  width: number;
}
export interface AccountingSheet {
  name: string;
  columns: SheetColumn[];
  rows: SheetCell[][];
}

export interface AccountingPayment {
  id: string;
  invoice_id: string;
  paid_on: string;
  method: PaymentMethod;
  amount_ttc: number;
  note: string | null;
  recorder_name: string | null;
  invoice_number: string | null;
  client_id: string;
  client_name: string | null;
  invoice_ht: number;
  invoice_vat: number;
  invoice_ttc: number;
}
export interface AccountingCreditNote {
  id: string;
  number: string;
  issued_at: string;
  reason: string | null;
  amount_ht: number;
  vat_rate: number;
  total_vat: number | null;
  total_ttc: number | null;
  invoice_number: string | null;
  client_id: string;
  client_name: string | null;
  vehicle_label: string | null;
}
export interface AccountingData {
  from: string;
  to: string;
  invoices: InvoiceOverview[];
  lines: Map<string, InvoiceLine[]>;
  payments: AccountingPayment[];
  creditNotes: AccountingCreditNote[];
  /** Taux de TVA des factures en TVA sur la marge. */
  marginRates: Map<string, number>;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = <T>(items: T[], pick: (item: T) => number | null | undefined) =>
  round(items.reduce((total, item) => total + (pick(item) ?? 0), 0));

const PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Jour de Paris (AAAA-MM-JJ) d'un horodatage, ou la date telle quelle. */
export const parisDay = (value: string | null | undefined) =>
  !value ? null : value.length === 10 ? value : PARIS.format(new Date(value));

const frDay = (day: string) => day.split('-').reverse().join('/');

// ---------------------------------------------------------------- Comptes

interface Account {
  number: string;
  label: string;
}
const CLIENTS: Account = { number: '411000', label: 'Clients' };
const VAT: Account = { number: '445710', label: 'TVA collectée' };
const CREDIT_NOTES: Account = { number: '709000', label: 'Rabais, remises et ristournes accordés' };
const SERVICES: Account = { number: '706000', label: 'Prestations de services' };
const GOODS: Account = { number: '707000', label: 'Ventes de marchandises' };
const RENTALS: Account = { number: '706300', label: 'Locations de véhicules' };
const VEHICLE_SALES: Account = { number: '775000', label: 'Produits des cessions d’éléments d’actif' };

const SALES_ACCOUNTS: Partial<Record<InvoiceLine['line_type'], Account>> = {
  labor: SERVICES,
  package: SERVICES,
  travel: SERVICES,
  subcontract: SERVICES,
  part: GOODS,
  consumable: GOODS,
  rental: RENTALS,
  vehicle: VEHICLE_SALES,
};
const accountOf = (line: Pick<InvoiceLine, 'line_type'>) => SALES_ACCOUNTS[line.line_type] ?? SERVICES;

const BANK: Account = { number: '512000', label: 'Banque' };
const PAYMENT_ACCOUNTS: Record<PaymentMethod, Account> = {
  bank_transfer: BANK,
  card: BANK,
  direct_debit: BANK,
  check: { number: '511200', label: 'Chèques à encaisser' },
  cash: { number: '530000', label: 'Caisse' },
  bill_of_exchange: { number: '511300', label: 'Effets à l’encaissement' },
};

const NATURE_LABELS: Partial<Record<InvoiceLine['line_type'], string>> = {
  labor: 'Main d’œuvre',
  package: 'Forfait',
  travel: 'Déplacement',
  subcontract: 'Sous-traitance',
  part: 'Pièce',
  consumable: 'Consommable',
  rental: 'Location',
  vehicle: 'Vente de véhicule',
};

// ---------------------------------------------------------------- Montants par facture

const billedLines = (data: AccountingData, invoice: InvoiceOverview) =>
  (data.lines.get(invoice.id) ?? []).filter((line) => line.line_type !== 'text');
const netOf = (line: InvoiceLine) => line.net_ht ?? lineNet(line);
const isMargin = (invoice: InvoiceOverview) => invoice.vat_scheme === 'margin';
const schemeLabel = (invoice: InvoiceOverview) =>
  isMargin(invoice) ? 'TVA sur la marge' : invoice.vat_exempt ? 'Exonération' : 'Normal';

/** Net HT d'une ligne pour la comptabilité : en TVA sur la marge, hors TVA comprise dans le prix. */
const accountingNet = (invoice: InvoiceOverview, line: InvoiceLine) =>
  isMargin(invoice) ? invoice.total_ht : netOf(line);

/** Coût d'achat d'une ligne (sous-traitance : prix global, sinon prix unitaire × quantité), port compris. */
function lineCost(invoice: InvoiceOverview, line: InvoiceLine) {
  if (isMargin(invoice)) return invoice.margin_purchase_price ?? 0;
  if (line.purchase_price === null && line.shipping_cost === null) return null;
  const quantity = line.line_type === 'subcontract' ? 1 : line.quantity;
  return round((line.purchase_price ?? 0) * quantity + (line.shipping_cost ?? 0));
}

/** Produits de la facture par compte. Sans lignes détaillées (reprise) ou écart d'arrondi : sur le compte principal. */
function salesByAccount(data: AccountingData, invoice: InvoiceOverview) {
  const byAccount = new Map<string, { account: Account; amount: number }>();
  for (const line of billedLines(data, invoice)) {
    const account = accountOf(line);
    const entry = byAccount.get(account.number) ?? { account, amount: 0 };
    entry.amount = round(entry.amount + accountingNet(invoice, line));
    byAccount.set(account.number, entry);
  }
  const entries = [...byAccount.values()];
  const gap = round(invoice.total_ht - sum(entries, (entry) => entry.amount));
  if (gap !== 0) {
    const main = [...entries].sort((a, b) => b.amount - a.amount)[0];
    if (main) main.amount = round(main.amount + gap);
    else entries.push({ account: SERVICES, amount: gap });
  }
  return entries;
}

/** Bases et TVA de la facture par taux, comme à l'émission. */
function vatByRate(data: AccountingData, invoice: InvoiceOverview) {
  if (isMargin(invoice)) {
    return [{ rate: data.marginRates.get(invoice.id) ?? 0, base: invoice.total_ht, vat: invoice.total_vat }];
  }
  const bases = new Map<number, number>();
  for (const line of billedLines(data, invoice)) {
    bases.set(line.vat_rate, round((bases.get(line.vat_rate) ?? 0) + netOf(line)));
  }
  if (bases.size === 0) {
    const rate = invoice.total_ht > 0 ? round((invoice.total_vat / invoice.total_ht) * 100) : 0;
    return [{ rate, base: invoice.total_ht, vat: invoice.total_vat }];
  }
  return [...bases]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, base]) => ({ rate, base, vat: round((base * rate) / 100) }));
}

const natureOf = (data: AccountingData, invoice: InvoiceOverview) => {
  const lines = billedLines(data, invoice);
  if (lines.some((line) => line.line_type === 'vehicle')) return 'Vente de véhicule';
  if (lines.some((line) => line.line_type === 'rental')) return 'Location';
  return 'Atelier';
};

const stateOf = (invoice: InvoiceOverview) =>
  invoice.payment_status ? PAYMENT_STATUS_META[invoice.payment_status].label : '';

const singleLine = (text: string | null) => (text ?? '').replace(/\s*\n\s*/g, ' · ').trim();

// ---------------------------------------------------------------- Onglets

const text = (header: string, width = 16): SheetColumn => ({ header, kind: 'text', width });
const money = (header: string, width = 13): SheetColumn => ({ header, kind: 'money', width });
const date = (header: string): SheetColumn => ({ header, kind: 'date', width: 12 });
const integer = (header: string, width = 10): SheetColumn => ({ header, kind: 'integer', width });
const decimal = (header: string, width = 9): SheetColumn => ({ header, kind: 'decimal', width });

function summarySheet(data: AccountingData): AccountingSheet {
  const { invoices, payments, creditNotes } = data;
  const allLines = invoices.flatMap((invoice) =>
    billedLines(data, invoice).map((line) => ({ invoice, line })),
  );
  const natureRows = Object.entries(NATURE_LABELS)
    .map(([type, label]): SheetCell[] => [
      `CA HT : ${label}`,
      sum(
        allLines.filter(({ line }) => line.line_type === type),
        ({ invoice, line }) => accountingNet(invoice, line),
      ),
    ])
    .filter((row) => row[1] !== 0);
  const methodRows = Object.entries(PAYMENT_METHODS)
    .map(([method, label]): SheetCell[] => [
      `Encaissé : ${label}`,
      sum(
        payments.filter((payment) => payment.method === method),
        (payment) => payment.amount_ttc,
      ),
    ])
    .filter((row) => row[1] !== 0);
  const marginInvoices = invoices.filter(isMargin);
  const creditHt = sum(creditNotes, (note) => note.amount_ht);
  const creditVat = sum(creditNotes, (note) => note.total_vat);
  const ht = sum(invoices, (invoice) => invoice.total_ht);
  const vat = sum(invoices, (invoice) => invoice.total_vat);
  return {
    name: 'Synthèse',
    columns: [text('Rubrique', 44), money('Montant (€)', 16)],
    rows: [
      [
        `Période : ${data.from ? `du ${frDay(data.from)}` : 'depuis le début'}${data.to ? ` au ${frDay(data.to)}` : ''}`,
        null,
      ],
      [
        `Factures : ${invoices.length} · Avoirs : ${creditNotes.length} · Paiements : ${payments.length}`,
        null,
      ],
      ['Chiffre d’affaires HT facturé', ht],
      ['TVA facturée', vat],
      ['dont TVA sur la marge', sum(marginInvoices, (invoice) => invoice.total_vat)],
      ['Total TTC facturé', sum(invoices, (invoice) => invoice.total_ttc)],
      ['Avoirs HT', creditHt],
      ['Avoirs TVA', creditVat],
      ['Chiffre d’affaires HT net des avoirs', round(ht - creditHt)],
      ['TVA nette des avoirs', round(vat - creditVat)],
      ...natureRows,
      ['Encaissé sur la période (TTC)', sum(payments, (payment) => payment.amount_ttc)],
      ['dont TVA encaissée (au prorata)', sum(payments, paymentVat)],
      ...methodRows,
      ['Reste dû sur les factures de la période', sum(invoices, (invoice) => invoice.balance_due)],
    ],
  };
}

function invoicesSheet(data: AccountingData): AccountingSheet {
  return {
    name: 'Factures',
    columns: [
      text('N° facture', 12),
      date('Date facture'),
      date('Date prestation'),
      date('Échéance'),
      text('Mois', 9),
      text('Client', 28),
      text('SIRET client', 16),
      text('N° TVA client', 16),
      text('Adresse de facturation', 36),
      text('Véhicule', 24),
      integer('Kilométrage'),
      text('OR', 14),
      text('Nature', 16),
      text('Régime TVA', 16),
      money('Total HT'),
      money('TVA'),
      money('Total TTC'),
      money('Main d’œuvre HT'),
      money('Pièces et fournitures HT'),
      money('Autres HT'),
      money('Coût d’achat'),
      money('Marge brute HT'),
      money('Encaissé TTC'),
      money('Avoirs TTC'),
      money('Reste dû'),
      text('État', 18),
      date('Dernier paiement'),
      integer('Relances'),
      text('Mention TVA', 40),
    ],
    rows: data.invoices.map((invoice) => {
      const lines = billedLines(data, invoice);
      const by = (types: InvoiceLine['line_type'][]) =>
        sum(
          lines.filter((line) => types.includes(line.line_type)),
          (line) => accountingNet(invoice, line),
        );
      const labor = by(['labor', 'package', 'travel']);
      const parts = by(['part', 'consumable', 'subcontract']);
      const costs = lines.map((line) => lineCost(invoice, line));
      const known = costs.some((cost) => cost !== null);
      const cost = sum(costs, (value) => value);
      const issued = parisDay(invoice.issued_at);
      return [
        invoice.number,
        issued,
        parisDay(invoice.service_date),
        parisDay(invoice.due_date),
        issued?.slice(0, 7) ?? null,
        invoice.client_name,
        invoice.client_siret,
        invoice.client_vat_number,
        singleLine(invoice.client_address),
        invoice.vehicle_label,
        invoice.mileage,
        invoice.repair_order_numbers.join(', '),
        natureOf(data, invoice),
        schemeLabel(invoice),
        invoice.total_ht,
        invoice.total_vat,
        invoice.total_ttc,
        labor,
        parts,
        round(invoice.total_ht - labor - parts),
        known ? cost : null,
        known ? round(invoice.total_ht - cost) : null,
        invoice.paid_ttc ?? 0,
        invoice.credited_ttc ?? 0,
        invoice.balance_due ?? 0,
        stateOf(invoice),
        parisDay(invoice.last_paid_on),
        invoice.reminders_count,
        singleLine(invoice.vat_exempt_mention),
      ];
    }),
  };
}

function linesSheet(data: AccountingData): AccountingSheet {
  return {
    name: 'Lignes',
    columns: [
      text('N° facture', 12),
      date('Date facture'),
      text('Client', 28),
      text('Véhicule', 24),
      integer('N° ligne', 8),
      text('Nature', 18),
      text('Désignation', 48),
      text('Réf. fabricant', 16),
      text('Réf. constructeur', 16),
      text('Marque', 14),
      decimal('Quantité'),
      money('PU HT'),
      decimal('Remise %'),
      money('Net HT'),
      decimal('Taux TVA %'),
      money('TVA'),
      money('Total TTC'),
      money('Coût d’achat'),
      money('Marge HT'),
      text('Compte', 10),
    ],
    rows: data.invoices.flatMap((invoice) =>
      billedLines(data, invoice).map((line, index) => {
        const net = accountingNet(invoice, line);
        const rate = isMargin(invoice) ? (data.marginRates.get(invoice.id) ?? 0) : line.vat_rate;
        const vat = isMargin(invoice) ? invoice.total_vat : round((net * rate) / 100);
        const cost = lineCost(invoice, line);
        return [
          invoice.number,
          parisDay(invoice.issued_at),
          invoice.client_name,
          invoice.vehicle_label,
          index + 1,
          NATURE_LABELS[line.line_type] ?? line.line_type,
          singleLine(line.description),
          line.manufacturer_ref,
          line.oem_ref,
          line.brand,
          line.quantity,
          line.unit_price,
          line.discount_percent,
          net,
          rate,
          vat,
          round(net + vat),
          cost,
          cost === null ? null : round(net - cost),
          accountOf(line).number,
        ];
      }),
    ),
  };
}

function vatSheet(data: AccountingData): AccountingSheet {
  interface Row {
    month: string;
    scheme: string;
    rate: number;
    base: number;
    vat: number;
    creditBase: number;
    creditVat: number;
  }
  const rows = new Map<string, Row>();
  const rowFor = (month: string, scheme: string, rate: number) => {
    const key = `${month}|${scheme}|${rate}`;
    const row = rows.get(key) ?? { month, scheme, rate, base: 0, vat: 0, creditBase: 0, creditVat: 0 };
    rows.set(key, row);
    return row;
  };
  for (const invoice of data.invoices) {
    const month = parisDay(invoice.issued_at)?.slice(0, 7) ?? '';
    for (const { rate, base, vat } of vatByRate(data, invoice)) {
      const row = rowFor(month, schemeLabel(invoice), rate);
      row.base = round(row.base + base);
      row.vat = round(row.vat + vat);
    }
  }
  for (const note of data.creditNotes) {
    const row = rowFor(parisDay(note.issued_at)?.slice(0, 7) ?? '', 'Avoir', note.vat_rate);
    row.creditBase = round(row.creditBase + note.amount_ht);
    row.creditVat = round(row.creditVat + (note.total_vat ?? 0));
  }
  return {
    name: 'TVA',
    columns: [
      text('Mois', 9),
      text('Régime', 18),
      decimal('Taux %'),
      money('Base HT facturée', 16),
      money('TVA facturée'),
      money('Avoirs HT'),
      money('Avoirs TVA'),
      money('TVA nette'),
    ],
    rows: [...rows.values()]
      .sort((a, b) => a.month.localeCompare(b.month) || b.rate - a.rate)
      .map((row) => [
        row.month,
        row.scheme,
        row.rate,
        row.base,
        row.vat,
        row.creditBase,
        row.creditVat,
        round(row.vat - row.creditVat),
      ]),
  };
}

/** TVA comprise dans un paiement, au prorata de la facture (TVA sur les encaissements). */
function paymentVat(payment: AccountingPayment) {
  return payment.invoice_ttc > 0
    ? round((payment.amount_ttc * payment.invoice_vat) / payment.invoice_ttc)
    : 0;
}

function paymentsSheet(data: AccountingData): AccountingSheet {
  return {
    name: 'Paiements',
    columns: [
      date('Date'),
      text('Mois', 9),
      text('N° facture', 12),
      text('Client', 28),
      text('Mode', 16),
      money('Montant TTC'),
      money('dont HT'),
      money('dont TVA'),
      text('Compte', 10),
      text('Note', 30),
      text('Enregistré par', 18),
    ],
    rows: data.payments.map((payment) => {
      const vat = paymentVat(payment);
      return [
        payment.paid_on,
        payment.paid_on.slice(0, 7),
        payment.invoice_number,
        payment.client_name,
        PAYMENT_METHODS[payment.method],
        payment.amount_ttc,
        round(payment.amount_ttc - vat),
        vat,
        PAYMENT_ACCOUNTS[payment.method].number,
        payment.note,
        payment.recorder_name,
      ];
    }),
  };
}

const creditTotals = (note: AccountingCreditNote) => {
  const vat = note.total_vat ?? round((note.amount_ht * note.vat_rate) / 100);
  return { vat, ttc: note.total_ttc ?? round(note.amount_ht + vat) };
};

function creditNotesSheet(data: AccountingData): AccountingSheet {
  return {
    name: 'Avoirs',
    columns: [
      text('N° avoir', 12),
      date('Date'),
      text('Mois', 9),
      text('N° facture', 12),
      text('Client', 28),
      text('Véhicule', 24),
      text('Motif', 36),
      money('Montant HT'),
      decimal('Taux TVA %'),
      money('TVA'),
      money('Total TTC'),
    ],
    rows: data.creditNotes.map((note) => {
      const { vat, ttc } = creditTotals(note);
      const day = parisDay(note.issued_at);
      return [
        note.number,
        day,
        day?.slice(0, 7) ?? null,
        note.invoice_number,
        note.client_name,
        note.vehicle_label,
        note.reason,
        note.amount_ht,
        note.vat_rate,
        vat,
        ttc,
      ];
    }),
  };
}

const compactDay = (day: string | null) => (day ?? '').replace(/-/g, '');

/** Écritures en partie double, colonnes du fichier des écritures comptables (FEC). */
export function entriesSheet(data: AccountingData): AccountingSheet {
  const rows: SheetCell[][] = [];
  const counters = { VT: 0, AV: 0, BQ: 0 };
  const journals = { VT: 'Ventes', AV: 'Avoirs', BQ: 'Encaissements' };
  const add = (
    journal: keyof typeof counters,
    day: string | null,
    piece: string | null,
    label: string,
    lines: {
      account: Account;
      clientId?: string;
      clientName?: string | null;
      debit: number;
      credit: number;
    }[],
  ) => {
    counters[journal] += 1;
    const number = `${journal}${String(counters[journal]).padStart(6, '0')}`;
    for (const line of lines) {
      if (line.debit === 0 && line.credit === 0) continue;
      rows.push([
        journal,
        journals[journal],
        number,
        compactDay(day),
        line.account.number,
        line.account.label,
        line.clientId ? `C${line.clientId.slice(0, 8).toUpperCase()}` : '',
        line.clientName ?? '',
        piece,
        compactDay(day),
        label,
        line.debit,
        line.credit,
        '',
        '',
        compactDay(day),
        null,
        '',
      ]);
    }
  };

  for (const invoice of data.invoices) {
    const client = { account: CLIENTS, clientId: invoice.client_id, clientName: invoice.client_name };
    const label = `Facture ${invoice.number ?? ''} ${invoice.client_name ?? ''}`.trim();
    add('VT', parisDay(invoice.issued_at), invoice.number, label, [
      { ...client, debit: invoice.total_ttc, credit: 0 },
      ...salesByAccount(data, invoice).map(({ account, amount }) =>
        amount >= 0 ? { account, debit: 0, credit: amount } : { account, debit: -amount, credit: 0 },
      ),
      { account: VAT, debit: 0, credit: invoice.total_vat },
    ]);
  }
  for (const note of data.creditNotes) {
    const { vat, ttc } = creditTotals(note);
    add(
      'AV',
      parisDay(note.issued_at),
      note.number,
      `Avoir ${note.number} ${note.client_name ?? ''}`.trim(),
      [
        { account: CREDIT_NOTES, debit: note.amount_ht, credit: 0 },
        { account: VAT, debit: vat, credit: 0 },
        {
          account: CLIENTS,
          clientId: note.client_id,
          clientName: note.client_name,
          debit: 0,
          credit: ttc,
        },
      ],
    );
  }
  for (const payment of data.payments) {
    add(
      'BQ',
      payment.paid_on,
      payment.invoice_number,
      `${PAYMENT_METHODS[payment.method]} ${payment.invoice_number ?? ''} ${payment.client_name ?? ''}`.trim(),
      [
        { account: PAYMENT_ACCOUNTS[payment.method], debit: payment.amount_ttc, credit: 0 },
        {
          account: CLIENTS,
          clientId: payment.client_id,
          clientName: payment.client_name,
          debit: 0,
          credit: payment.amount_ttc,
        },
      ],
    );
  }
  return {
    name: 'Écritures',
    columns: [
      text('JournalCode', 11),
      text('JournalLib', 14),
      text('EcritureNum', 12),
      text('EcritureDate', 12),
      text('CompteNum', 10),
      text('CompteLib', 30),
      text('CompAuxNum', 12),
      text('CompAuxLib', 28),
      text('PieceRef', 12),
      text('PieceDate', 10),
      text('EcritureLib', 40),
      money('Debit'),
      money('Credit'),
      text('EcritureLet', 10),
      text('DateLet', 10),
      text('ValidDate', 10),
      money('Montantdevise'),
      text('Idevise', 8),
    ],
    rows,
  };
}

export const accountingSheets = (data: AccountingData): AccountingSheet[] => [
  summarySheet(data),
  invoicesSheet(data),
  linesSheet(data),
  vatSheet(data),
  paymentsSheet(data),
  creditNotesSheet(data),
  entriesSheet(data),
];

// ---------------------------------------------------------------- Fichiers

/** Valeurs d'un onglet pour le CSV : dates JJ/MM/AAAA, entiers sans décimales. */
export function csvCells(sheet: AccountingSheet): { headers: string[]; rows: CsvCell[][] } {
  return {
    headers: sheet.columns.map((column) => column.header),
    rows: sheet.rows.map((row) =>
      row.map((value, index) => {
        const kind = sheet.columns[index]?.kind;
        if (kind === 'date' && typeof value === 'string') return frDay(value);
        if (kind === 'integer' && typeof value === 'number') return String(value);
        return value;
      }),
    ),
  };
}

/** Nom de fichier d'un onglet : sans accents. */
export const sheetFileName = (sheet: AccountingSheet) =>
  `${sheet.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}.csv`;

/** Classeur Excel : en-têtes figés et en gras, montants et dates dans leur format. */
export async function buildAccountingWorkbook(sheets: AccountingSheet[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const FORMATS: Partial<Record<ColumnKind, string>> = {
    money: '#,##0.00',
    decimal: '0.##',
    integer: '0',
    date: 'dd/mm/yyyy',
  };
  return writeXlsxFile(
    sheets.map((sheet) => ({
      sheet: sheet.name,
      stickyRowsCount: 1,
      columns: sheet.columns.map((column) => ({ width: column.width })),
      data: [
        sheet.columns.map((column) => ({
          value: column.header,
          type: String,
          fontWeight: 'bold' as const,
          backgroundColor: '#E2F1E2',
          wrap: true,
        })),
        ...sheet.rows.map((row) =>
          row.map((value, index) => {
            const column = sheet.columns[index];
            if (value === null || value === '') return null;
            if (column?.kind === 'date' && typeof value === 'string') {
              return { value: new Date(`${value}T00:00:00Z`), type: Date, format: FORMATS.date! };
            }
            if (typeof value === 'number') {
              return { value, type: Number, format: FORMATS[column?.kind ?? 'money'] ?? FORMATS.money! };
            }
            return { value, type: String };
          }),
        ),
      ],
    })),
  ).toBlob();
}
