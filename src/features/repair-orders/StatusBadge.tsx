import { cn } from '@/lib/utils';
import { STATUS_META, type RepairOrderStatus } from './constants';

export function StatusBadge({ status, className }: { status: RepairOrderStatus; className?: string }) {
  const meta = STATUS_META[status];
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
