import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { STATUS_META, type RepairOrderStatus } from './constants';

/** Pastille du statut de l'OR (couleur du statut, comme la maquette). */
export function StatusBadge({ status, className }: { status: RepairOrderStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('badge', className)} style={{ '--c': meta.color } as CSSProperties}>
      {meta.label}
    </span>
  );
}
