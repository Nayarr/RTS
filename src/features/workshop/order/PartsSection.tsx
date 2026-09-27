import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RoLine } from '@/features/repair-orders/api';
import { PART_ORDER_META } from '@/features/repair-orders/supplies';
import { formatQuantity } from '@/lib/numbers';

/** Pièces prévues par le bureau, avec leur état de commande (lecture seule, sans prix). */
export function PartsSection({ lines }: { lines: RoLine[] }) {
  const parts = lines.filter((line) => line.line_type === 'part');
  if (parts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Pièces</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {parts.map((line) => {
            const meta = PART_ORDER_META[line.order_status ?? 'to_order'];
            return (
              <li key={line.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-base">
                  {line.description.split('\n')[0]}
                  {line.quantity !== 1 && ` × ${formatQuantity(line.quantity)}`}
                </span>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
