import type { RoLine } from '@/features/repair-orders/api';
import { PART_ORDER_META } from '@/features/repair-orders/supplies';
import { formatQuantity } from '@/lib/numbers';

/** Pièces prévues par le bureau, avec leur état de commande (lecture seule, sans prix). */
export function PartsSection({ lines }: { lines: RoLine[] }) {
  const parts = lines.filter((line) => line.line_type === 'part');
  if (parts.length === 0) return null;

  return (
    <section data-slot="card" className="card sec" aria-labelledby="tech-parts">
      <h2 className="sec-t" id="tech-parts">
        Pièces
      </h2>
      <ul className="col gap-2.5">
        {parts.map((line) => {
          const meta = PART_ORDER_META[line.order_status ?? 'to_order'];
          return (
            <li key={line.id} className="row between gap-3">
              <span className="text-sm">
                {line.description.split('\n')[0]}
                {line.quantity !== 1 && ` × ${formatQuantity(line.quantity)}`}
              </span>
              <span className="badge shrink-0" style={{ '--c': meta.color } as React.CSSProperties}>
                {meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
