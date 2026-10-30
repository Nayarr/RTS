import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CATEGORY_META, orderCategory, type RepairOrderStatus } from './constants';

/**
 * Pastille du statut de l'OR (couleur du statut, comme la maquette).
 * `technicianId` : null pour un OR pas encore assigné (affiché « Non assigné »).
 * `quoteSent` : devis parti au client, en attente de sa réponse (« Devis envoyé »).
 */
export function StatusBadge({
  status,
  technicianId,
  quoteSent,
  className,
}: {
  status: RepairOrderStatus;
  technicianId?: string | null;
  quoteSent?: boolean | null;
  className?: string;
}) {
  const meta =
    CATEGORY_META[
      orderCategory({
        status,
        technician_id: technicianId,
        quote_sent: quoteSent,
      })
    ];
  return (
    <span className={cn('badge', className)} style={{ '--c': meta.color } as CSSProperties}>
      {meta.label}
    </span>
  );
}
