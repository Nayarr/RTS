import { lineNet } from '@/features/documents/lines';
import type { ClientBilling, InvoiceLine, InvoiceOverview, PaymentMethod, PaymentStatus } from './api';

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
  if (!client.billing_address?.trim()) warnings.push('adresse du client manquante');
  if (!client.siren?.trim()) warnings.push('SIREN du client manquant');
  return warnings;
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
