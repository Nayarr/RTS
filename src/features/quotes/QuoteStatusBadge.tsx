import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { QuoteStatus } from './api';
import { quoteDisplayStatus, quoteStatusMeta } from './domain';

/** Statut du devis ; accepté avec son OR déjà créé : « Transformé en OR ». */
export function QuoteStatusBadge({
  status,
  orderCreated,
  className,
}: {
  status: QuoteStatus;
  orderCreated?: boolean | null;
  className?: string;
}) {
  const meta = quoteStatusMeta(quoteDisplayStatus({ status, order_created: orderCreated }));
  return (
    <span className={cn('badge', className)} style={{ '--c': meta.color } as CSSProperties}>
      {meta.label}
    </span>
  );
}
