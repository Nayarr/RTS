import { useState, type CSSProperties } from 'react';
import { ChevronDown, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
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
    <li className="li flex-wrap">
      <div className="col min-w-0 flex-1 basis-56 gap-0.5">
        <b>{firstLine(line.description)}</b>
        <span className="muted text-[12.5px]">
          {formatQuantity(line.quantity)} × {formatEuro(line.unit_price)}
          {line.purchase_price !== null && ` · achat ${formatEuro(line.purchase_price)}`}
          {details && ` · ${details}`}
        </span>
      </div>
      <b className="num">{formatEuro(partLineTotal(line))}</b>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Déclarer un retour : ${firstLine(line.description)}`}
        onClick={onReturn}
      >
        <Undo2 /> Retour
      </Button>
      <span className="relative inline-flex">
        <select
          aria-label={`Commande : ${firstLine(line.description)}`}
          className="badge h-8 cursor-pointer appearance-none pr-7 pl-3 disabled:cursor-default disabled:opacity-70"
          style={{ '--c': PART_ORDER_META[status].color } as CSSProperties}
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
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2"
          style={{ color: PART_ORDER_META[status].color }}
        />
      </span>
      {editable && (
        <span className="row gap-0">
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label={`Modifier ${firstLine(line.description)}`}
            onClick={onEdit}
          >
            <Pencil className="i s" />
          </button>
          <button
            type="button"
            className="ibtn sm ghost text-destructive"
            aria-label={`Retirer ${firstLine(line.description)}`}
            onClick={onDelete}
          >
            <Trash2 className="i s" />
          </button>
        </span>
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
    <section data-slot="card" className="card" aria-labelledby="ro-parts">
      <div className="card-h">
        <h2 className="h2" id="ro-parts">
          Pièces{' '}
          <span className="cnt" aria-hidden>
            {parts.length}
          </span>
        </h2>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
            <Plus /> Ajouter une pièce
          </Button>
        )}
      </div>
      {parts.length === 0 ? (
        <p className="card-b hint">Aucune pièce sur cet OR.</p>
      ) : (
        <>
          <ul>
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
          <div className="tfoot justify-end">
            <p>
              Total pièces :{' '}
              <b className="num">
                {formatEuro(parts.reduce((sum, line) => sum + partLineTotal(line), 0))} HT
              </b>
            </p>
          </div>
        </>
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
    </section>
  );
}
