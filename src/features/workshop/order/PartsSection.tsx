import { Recycle } from 'lucide-react';
import { addPartCore, deletePartCore } from '@/features/consignes/api';
import { usePartCoreMutation, useRepairOrderCores } from '@/features/consignes/hooks';
import type { RoLine } from '@/features/repair-orders/api';
import { PART_ORDER_META } from '@/features/repair-orders/supplies';
import { formatQuantity } from '@/lib/numbers';

const firstLine = (text: string) => text.split('\n')[0] ?? '';

/**
 * Pièces prévues par le bureau, avec leur état de commande (sans prix). Le mécano signale une
 * ancienne pièce en consigne : elle est gardée pour être renvoyée au fournisseur.
 */
export function PartsSection({
  repairOrderId,
  lines,
  locked,
}: {
  repairOrderId: string;
  lines: RoLine[];
  locked: boolean;
}) {
  const parts = lines.filter((line) => line.line_type === 'part');
  const cores = useRepairOrderCores(repairOrderId).data ?? {};
  const toggle = usePartCoreMutation(
    ({ line, coreId }: { line: RoLine; coreId: string | null }) =>
      coreId ? deletePartCore(coreId) : addPartCore(repairOrderId, line.id),
    ({ line, coreId }) =>
      coreId
        ? `${firstLine(line.description)} : plus de consigne`
        : `${firstLine(line.description)} : ancienne pièce à garder`,
  );
  if (parts.length === 0) return null;

  return (
    <section data-slot="card" className="card sec" aria-labelledby="tech-parts">
      <h2 className="sec-t" id="tech-parts">
        Pièces
      </h2>
      <ul className="col gap-3">
        {parts.map((line) => {
          const meta = PART_ORDER_META[line.order_status ?? 'to_order'];
          const core = cores[line.id];
          // Une fois renvoyée par le bureau, la consigne n'est plus modifiable par le mécano
          const canToggle = !locked && (!core || core.status === 'to_return');
          return (
            <li key={line.id} className="col gap-1.5">
              <span className="row between gap-3">
                <span className="text-sm">
                  {firstLine(line.description)}
                  {line.quantity !== 1 && ` × ${formatQuantity(line.quantity)}`}
                </span>
                <span className="badge shrink-0" style={{ '--c': meta.color } as React.CSSProperties}>
                  {meta.label}
                </span>
              </span>
              {core?.status === 'to_return' && (
                <span className="row gap-1.5 text-[13px] font-semibold" style={{ color: '#B5453A' }}>
                  <Recycle className="size-4 shrink-0" /> Garder l’ancienne pièce (consigne)
                </span>
              )}
              {core && core.status !== 'to_return' && (
                <span className="row muted gap-1.5 text-[13px]">
                  <Recycle className="size-4 shrink-0" /> Ancienne pièce renvoyée au fournisseur
                </span>
              )}
              {canToggle && (
                <label className="row cursor-pointer gap-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    className="size-[18px] cursor-pointer accent-[var(--primary)]"
                    checked={core !== undefined}
                    disabled={toggle.isPending}
                    onChange={() => toggle.mutate({ line, coreId: core?.id ?? null })}
                  />
                  Ancienne pièce en consigne
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
