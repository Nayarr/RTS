import { cn } from '@/lib/utils';
import type { QuoteStatus } from './api';
import { QUOTE_STATUS_META } from './domain';

export function QuoteStatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  const meta = QUOTE_STATUS_META[status];
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
