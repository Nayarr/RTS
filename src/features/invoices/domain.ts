import { lineNet } from '@/features/documents/lines';
import { todayIso } from '@/features/repair-orders/schemas';
import type {
  AccountType,
  ClientBilling,
  InvoiceLine,
  InvoiceOverview,
  PaymentMethod,
  PaymentStatus,
} from './api';

/** Libellés et couleurs de l'ancienne appli. */
export const PAYMENT_STATUS_META: Record<PaymentStatus, { label: string; color: string }> = {
  paid: { label: 'Payée', color: '#2A6B52' },
  pending: { label: 'En attente', color: '#C98A00' },
  partial: { label: 'Partiellement payée', color: '#4750B5' },
  overdue: { label: 'En retard', color: '#B5453A' },
};

export const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  bank_transfer: 'Virement',
  check: 'Chèque',
  card: 'Carte bancaire',
  cash: 'Espèces',
  bill_of_exchange: 'LCR / Traite',
  direct_debit: 'Prélèvement',
};

/** Points à vérifier avant l'émission (comme l'ancienne appli) : l'émission reste possible. */
export function issueWarnings(lines: InvoiceLine[], client: ClientBilling): string[] {
  const unpriced = lines.filter(
    (line) => line.line_type !== 'text' && line.line_type !== 'package' && lineNet(line) <= 0,
  ).length;
  const warnings: string[] = [];
  if (unpriced) warnings.push(`${unpriced} ligne${unpriced > 1 ? 's' : ''} sans prix`);
  if (!client.siret?.trim()) warnings.push('SIRET du client manquant');
  return warnings;
}

/** Ce qui empêche l'émission (mention obligatoire, refusée aussi par la base). */
export function issueBlockers(client: ClientBilling): string[] {
  return client.billing_address?.trim()
    ? []
    : [
        'Renseigne l’adresse de facturation du client (carte « Client » sur cette page) avant d’émettre la facture.',
      ];
}

/** Reste dû en HT (proposé pour un avoir). */
export const balanceHt = (invoice: InvoiceOverview) =>
  invoice.total_ttc > 0
    ? Math.round(((invoice.balance_due ?? 0) * invoice.total_ht * 100) / invoice.total_ttc) / 100
    : 0;

/** Taux de TVA dominant de la facture (proposé pour un avoir). */
export function mainVatRate(lines: InvoiceLine[], fallback: number) {
  const bases = new Map<number, number>();
  for (const line of lines) {
    if (line.line_type === 'text') continue;
    bases.set(line.vat_rate, (bases.get(line.vat_rate) ?? 0) + lineNet(line));
  }
  let best = fallback;
  let max = -1;
  for (const [rate, base] of bases) {
    if (base > max) {
      best = rate;
      max = base;
    }
  }
  return best;
}

export const isInvoiceEditable = (invoice: { status: InvoiceOverview['status'] }) =>
  invoice.status === 'draft';

export interface ShareCompany {
  legal_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  email: string | null;
}

const frDate = (value: string | null) =>
  value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString('fr-FR') : '-';
const amount = (value: number | null) => `${(value ?? 0).toFixed(2).replace('.', ',')} €`;

/** Message d'envoi ou de relance d'une facture (textes de l'ancienne appli). */
export function invoiceShareMessage(
  invoice: Pick<
    InvoiceOverview,
    'number' | 'issued_at' | 'due_date' | 'vehicle_label' | 'total_ttc' | 'balance_due'
  >,
  link: string,
  company: ShareCompany,
  reminder: boolean,
) {
  const signature = [
    company.legal_name,
    `${company.address_line}, ${company.postal_code} ${company.city}`,
    company.email,
  ]
    .filter(Boolean)
    .join('\n');
  const number = invoice.number ?? '';
  const vehicle = invoice.vehicle_label ?? '';
  const body = reminder
    ? `Bonjour,\n\nSauf erreur de notre part, la facture ${number} du ${frDate(invoice.issued_at)} (véhicule ${vehicle}), ` +
      `arrivée à échéance le ${frDate(invoice.due_date)}, reste impayée pour un montant de ${amount(invoice.balance_due)} TTC.\n\n` +
      `Vous pouvez la consulter ici : ${link}\n\n` +
      'Merci de bien vouloir procéder à son règlement dans les meilleurs délais. Si le paiement a été effectué ' +
      `entre-temps, merci de ne pas tenir compte de ce message.\n\nCordialement,\n${signature}`
    : invoice.total_ttc <= 0
      ? // Tout offert : facture à 0 €, le geste commercial est détaillé dans la facture
        `Bonjour,\n\nVeuillez trouver ci-dessous le lien vers votre facture ${number} (véhicule ${vehicle}). ` +
        `Les travaux indiqués vous sont offerts à titre commercial : il n'y a rien à régler.\n\n` +
        `${link}\n\nCordialement,\n${signature}`
      : `Bonjour,\n\nVeuillez trouver ci-dessous le lien vers votre facture ${number} d'un montant de ` +
        `${amount(invoice.total_ttc)} TTC (véhicule ${vehicle}), à régler avant le ${frDate(invoice.due_date)} :\n\n` +
        `${link}\n\nCordialement,\n${signature}`;
  return {
    subject: `${reminder ? 'Relance · ' : ''}Facture ${number} · ${company.legal_name}`,
    body,
    sms:
      `${reminder ? 'Relance : ' : ''}Facture ${number} ${company.legal_name} ` +
      `(${amount(reminder ? invoice.balance_due : invoice.total_ttc)} TTC) : ${link}`,
  };
}

/** Facture échue et non soldée : la relance est proposée (comme l'ancienne appli). */
export const isOverdue = (invoice: Pick<InvoiceOverview, 'due_date' | 'balance_due'>, today = todayIso()) =>
  (invoice.balance_due ?? 0) > 0.01 && invoice.due_date !== null && invoice.due_date < today;

const csvDate = (value: string | null) => (value ? value.slice(0, 10).split('-').reverse().join('/') : '');

/** Lignes de l'export CSV des factures (pour la comptabilité). */
export function invoicesCsvRows(invoices: InvoiceOverview[]) {
  const headers = [
    'Numéro',
    'Date d’émission',
    'Échéance',
    'Client',
    'Véhicule',
    'OR',
    'Total HT',
    'TVA',
    'Total TTC',
    'Payé',
    'Avoirs',
    'Reste dû',
    'État',
  ];
  const rows = invoices.map((invoice) => [
    invoice.number ?? 'Brouillon',
    csvDate(invoice.issued_at),
    csvDate(invoice.due_date),
    invoice.client_name,
    invoice.vehicle_label,
    invoice.repair_order_numbers.join(', '),
    invoice.total_ht,
    invoice.total_vat,
    invoice.total_ttc,
    invoice.paid_ttc,
    invoice.credited_ttc,
    invoice.balance_due,
    invoice.status === 'draft' || !invoice.payment_status
      ? 'Brouillon'
      : PAYMENT_STATUS_META[invoice.payment_status].label,
  ]);
  return { headers, rows };
}

export const ACCOUNT_TYPES: Record<AccountType, string> = {
  comptant: 'Comptant',
  prelevement: 'Prélèvement',
};

/** Mode proposé pour un paiement : prélèvement pour un client en prélèvement, sinon carte. */
export const defaultPaymentMethod = (accountType: AccountType): PaymentMethod =>
  accountType === 'prelevement' ? 'direct_debit' : 'card';

const STAMP = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});

/** « Enregistré le 23/10/2026 à 14:32 par Réception ». */
export function recordedLabel(at: string, by: string | null | undefined): string {
  const [date, time] = STAMP.format(new Date(at)).split(' ');
  return `Enregistré le ${date} à ${time}${by ? ` par ${by}` : ''}`;
}

/** Facture émise payée en partie : un ou plusieurs paiements, reste encore dû. */
export const isPartiallyPaid = (invoice: Pick<InvoiceOverview, 'status' | 'paid_ttc' | 'balance_due'>) =>
  invoice.status === 'issued' && (invoice.paid_ttc ?? 0) > 0 && (invoice.balance_due ?? 0) > 0.01;

export interface OverdueClient {
  clientId: string;
  clientName: string;
  invoices: InvoiceOverview[];
  balance: number;
}

/** Factures en retard regroupées par client, le plus gros reste dû d'abord. */
export function overdueByClient(invoices: InvoiceOverview[], today = todayIso()): OverdueClient[] {
  const groups = new Map<string, OverdueClient>();
  for (const invoice of invoices) {
    if (invoice.status !== 'issued' || !isOverdue(invoice, today)) continue;
    const group = groups.get(invoice.client_id) ?? {
      clientId: invoice.client_id,
      clientName: invoice.client_name ?? '',
      invoices: [],
      balance: 0,
    };
    group.invoices.push(invoice);
    group.balance += invoice.balance_due ?? 0;
    groups.set(invoice.client_id, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      invoices: group.invoices.sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? '')),
      balance: Math.round(group.balance * 100) / 100,
    }))
    .sort((a, b) => b.balance - a.balance);
}

/** Relance d'un client pour toutes ses factures en retard : une ligne par facture, avec son lien. */
export function overdueReminderMessage(
  group: Pick<OverdueClient, 'invoices' | 'balance'>,
  links: Record<string, string>,
  company: ShareCompany,
) {
  const signature = [
    company.legal_name,
    `${company.address_line}, ${company.postal_code} ${company.city}`,
    company.email,
  ]
    .filter(Boolean)
    .join('\n');
  const several = group.invoices.length > 1;
  const lines = group.invoices
    .map(
      (invoice) =>
        `- Facture ${invoice.number ?? ''} du ${frDate(invoice.issued_at)}` +
        `${invoice.vehicle_label ? ` (véhicule ${invoice.vehicle_label})` : ''}, échue le ${frDate(invoice.due_date)} : ` +
        `${amount(invoice.balance_due)} TTC${links[invoice.id] ? `\n  ${links[invoice.id]}` : ''}`,
    )
    .join('\n');
  return {
    subject: several
      ? `Relance · Factures en attente de règlement · ${company.legal_name}`
      : `Relance · Facture ${group.invoices[0]?.number ?? ''} · ${company.legal_name}`,
    body:
      `Bonjour,\n\nSauf erreur de notre part, ${several ? 'les factures suivantes restent impayées après leur échéance' : 'la facture suivante reste impayée après son échéance'} ` +
      `:\n\n${lines}\n\nTotal restant dû : ${amount(group.balance)} TTC.\n\n` +
      'Merci de bien vouloir procéder au règlement dans les meilleurs délais. Si le paiement a été effectué ' +
      `entre-temps, merci de ne pas tenir compte de ce message.\n\nCordialement,\n${signature}`,
  };
}
