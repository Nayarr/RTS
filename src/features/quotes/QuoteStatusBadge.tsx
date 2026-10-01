import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { QuoteStatus } from './api';
import { QUOTE_STATUS_META } from './domain';

export function QuoteStatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  const meta = QUOTE_STATUS_META[status];
  return (
    <span className={cn('badge', className)} style={{ '--c': meta.color } as CSSProperties}>
      {meta.label}
    </span>
  );
}
