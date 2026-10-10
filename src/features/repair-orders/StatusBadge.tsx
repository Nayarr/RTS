import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { STATUS_META, UNASSIGNED_META, type RepairOrderStatus } from './constants';

/**
 * Pastille du statut de l'OR (couleur du statut, comme la maquette).
 * `technicianId` : null pour un OR pas encore assigné (affiché « Non assigné »).
 */
export function StatusBadge({
  status,
  technicianId,
  className,
}: {
  status: RepairOrderStatus;
  technicianId?: string | null;
  className?: string;
}) {
  const meta = status === 'assigned' && technicianId === null ? UNASSIGNED_META : STATUS_META[status];
  return (
    <span className={cn('badge', className)} style={{ '--c': meta.color } as CSSProperties}>
      {meta.label}
    </span>
  );
}
