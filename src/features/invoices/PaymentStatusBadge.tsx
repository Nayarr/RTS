import { cn } from '@/lib/utils';
import type { InvoiceOverview } from './api';
import { PAYMENT_STATUS_META } from './domain';

/** Brouillon, ou état d'encaissement d'une facture émise. */
export function InvoiceStatusBadge({
  invoice,
  className,
}: {
  invoice: Pick<InvoiceOverview, 'status' | 'payment_status'>;
  className?: string;
}) {
  const meta =
    invoice.status === 'draft' || !invoice.payment_status
      ? { label: 'Brouillon', color: '#6B7280' }
      : PAYMENT_STATUS_META[invoice.payment_status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-white',
        className,
      )}
      style={{ backgroundColor: meta.color }}
    >
      {meta.label}
    </span>
  );
}
