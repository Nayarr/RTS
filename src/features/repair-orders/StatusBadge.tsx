import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { CATEGORY_META, orderCategory, type RepairOrderStatus } from './constants';

/**
 * Pastille du statut de l'OR (couleur du statut, comme la maquette).
 * `technicianId` : null pour un OR pas encore assigné (affiché « Non assigné »).
 * `quoteSent` / `invoiceSent` : devis ou facture partis au client (« Devis envoyé », « Facture envoyée »).
 */
export function StatusBadge({
  status,
  technicianId,
  quoteSent,
  invoiceSent,
  className,
}: {
  status: RepairOrderStatus;
  technicianId?: string | null;
  quoteSent?: boolean | null;
  invoiceSent?: boolean | null;
  className?: string;
}) {
  const meta =
    CATEGORY_META[
      orderCategory({
        status,
        technician_id: technicianId,
        quote_sent: quoteSent,
        invoice_sent: invoiceSent,
      })
    ];
  return (
    <span className={cn('badge', className)} style={{ '--c': meta.color } as CSSProperties}>
      {meta.label}
    </span>
  );
}
