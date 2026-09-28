import { useState } from 'react';
import { Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { WarrantyDialog } from '@/features/warranties/WarrantyDialog';
import { formatEuro, formatQuantity } from '@/lib/numbers';
import type { RoLine } from '../api';
import { useRepairOrderMutation } from '../hooks';
import { PART_ORDER_META, partLineTotal } from '../supplies';
import { deletePartLine, setPartOrderStatus, type PartOrderStatus } from '../supplies-api';
import { PartLineDialog } from './PartLineDialog';

const firstLine = (text: string) => text.split('\n')[0] ?? '';

function PartRow({
  line,
  supplierName,
  editable,
  onEdit,
  onDelete,
  onReturn,
}: {
  line: RoLine;
  supplierName: string | undefined;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReturn: () => void;
}) {
  const status = line.order_status ?? 'to_order';
  const setStatus = useRepairOrderMutation(
    (next: PartOrderStatus) => setPartOrderStatus(line.id, next),
    (next) => `${firstLine(line.description)} : ${PART_ORDER_META[next].label.toLowerCase()}`,
  );
  const details = [supplierName, line.brand, line.manufacturer_ref ?? line.oem_ref]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium">{firstLine(line.description)}</p>
        <p className="text-sm text-muted-foreground">
          {formatQuantity(line.quantity)} × {formatEuro(line.unit_price)}
          {line.purchase_price !== null && ` · achat ${formatEuro(line.purchase_price)}`}
          {details && ` · ${details}`}
        </p>
      </div>
      <span className="font-semibold tabular-nums">{formatEuro(partLineTotal(line))}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Déclarer un retour : ${firstLine(line.description)}`}
        onClick={onReturn}
      >
        <Undo2 /> Retour
      </Button>
      <select
        aria-label={`Commande : ${firstLine(line.description)}`}
        className="h-9 rounded-md border-2 bg-transparent px-2 text-sm font-semibold disabled:opacity-70"
        style={{ borderColor: PART_ORDER_META[status].color, color: PART_ORDER_META[status].color }}
        value={status}
        disabled={!editable || setStatus.isPending}
        onChange={(event) => setStatus.mutate(event.target.value as PartOrderStatus)}
      >
        {Object.entries(PART_ORDER_META).map(([value, meta]) => (
          <option key={value} value={value}>
            {meta.label}
          </option>
        ))}
      </select>
      {editable && (
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Modifier ${firstLine(line.description)}`}
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            aria-label={`Retirer ${firstLine(line.description)}`}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      )}
    </li>
  );
}

/** Pièces de l'OR avec leur suivi de commande (À commander → Commandée → Reçue). */
export function PartsCard({
  repairOrderId,
  lines,
  partSuppliers,
  editable,
}: {
  repairOrderId: string;
  lines: RoLine[];
  partSuppliers: Record<string, string>;
  editable: boolean;
}) {
  const parts = lines.filter((line) => line.line_type === 'part');
  const [editing, setEditing] = useState<RoLine | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoLine | null>(null);
  const [returning, setReturning] = useState<RoLine | null>(null);
  const remove = useRepairOrderMutation((line: RoLine) => deletePartLine(line.id), 'Pièce retirée');
  const nextPosition =
    Math.max(-1, ...lines.filter((line) => line.kind === 'done').map((line) => line.position)) + 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Pièces</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {parts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune pièce sur cet OR.</p>
        ) : (
          <ul className="divide-y">
            {parts.map((line) => (
              <PartRow
                key={line.id}
                line={line}
                supplierName={partSuppliers[line.id]}
                editable={editable}
                onEdit={() => setEditing(line)}
                onDelete={() => setDeleting(line)}
                onReturn={() => setReturning(line)}
              />
            ))}
          </ul>
        )}
      </CardContent>
      {(editable || parts.length > 0) && (
        <CardFooter className="flex-wrap justify-between gap-2">
          {editable ? (
            <Button variant="outline" onClick={() => setEditing('new')}>
              <Plus /> Ajouter une pièce
            </Button>
          ) : (
            <span />
          )}
          {parts.length > 0 && (
            <p className="text-sm">
              Total pièces :{' '}
              <strong className="tabular-nums">
                {formatEuro(parts.reduce((sum, line) => sum + partLineTotal(line), 0))} HT
              </strong>
            </p>
          )}
        </CardFooter>
      )}

      {editing && (
        <PartLineDialog
          repairOrderId={repairOrderId}
          line={editing === 'new' ? null : editing}
          supplierName={editing === 'new' ? null : (partSuppliers[editing.id] ?? null)}
          nextPosition={nextPosition}
          onClose={() => setEditing(null)}
        />
      )}
      {returning && (
        <WarrantyDialog
          claim={null}
          roLineId={returning.id}
          preset={{
            part_name: firstLine(returning.description),
            brand: returning.brand,
            supplier_name: partSuppliers[returning.id] ?? '',
            reference: returning.manufacturer_ref ?? returning.oem_ref,
            amount_ht: returning.purchase_price,
          }}
          onClose={() => setReturning(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Retirer ${firstLine(deleting?.description ?? '')} ?`}
        description="La pièce ne sera plus facturée avec cet OR."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Card>
  );
}
