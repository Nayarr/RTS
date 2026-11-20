import { useState, type CSSProperties } from 'react';
import { ChevronDown, CircleDot, Pencil, Plus, Recycle, Trash2, Undo2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { TirePickDialog } from '@/features/tires/TirePickDialog';
import { addPartCore, type PartCore } from '@/features/consignes/api';
import { PART_CORE_META } from '@/features/consignes/domain';
import { usePartCoreMutation, useRepairOrderCores } from '@/features/consignes/hooks';
import { PartCoreDialog } from '@/features/consignes/PartCoreDialog';
import { WarrantyDialog } from '@/features/warranties/WarrantyDialog';
import type { Enums } from '@/types/database';
import { formatEuro, formatQuantity } from '@/lib/numbers';
import type { NewLine } from '@/features/documents/lines';
import type { RoLine } from '../api';
import { useRepairOrderMutation } from '../hooks';
import { PART_ORDER_META, partLineTotal } from '../supplies';
import { addStockTireLine, deletePartLine, setPartOrderStatus, type PartOrderStatus } from '../supplies-api';
import { PartLineDialog } from './PartLineDialog';

const firstLine = (text: string) => text.split('\n')[0] ?? '';

function PartRow({
  line,
  supplierName,
  core,
  editable,
  onEdit,
  onDelete,
  onReturn,
  onCore,
}: {
  line: RoLine;
  supplierName: string | undefined;
  core: PartCore | undefined;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReturn: () => void;
  onCore: () => void;
}) {
  const addCore = usePartCoreMutation(
    () => addPartCore(line.repair_order_id, line.id),
    `${firstLine(line.description)} : ancienne pièce en consigne`,
  );
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
      {core ? (
        <button
          type="button"
          className="badge h-8 cursor-pointer px-3"
          style={{ '--c': PART_CORE_META[core.status].color } as CSSProperties}
          aria-label={`Consigne de ${firstLine(line.description)} : ${PART_CORE_META[core.status].label}`}
          onClick={onCore}
        >
          <Recycle className="size-3.5" /> Consigne · {PART_CORE_META[core.status].label.toLowerCase()}
          {core.amount_ht !== null && ` · ${formatEuro(core.amount_ht)}`}
        </button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Mettre l’ancienne pièce en consigne : ${firstLine(line.description)}`}
          disabled={addCore.isPending}
          onClick={() => addCore.mutate(undefined)}
        >
          <Recycle /> Consigne
        </Button>
      )}
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

/** Pièces de l'OR avec leur suivi de commande (À commander → Commandée → Reçue) et leur consigne. */
export function PartsCard({
  repairOrderId,
  repairOrderNumber,
  vehicleType,
  lines,
  partSuppliers,
  editable,
}: {
  repairOrderId: string;
  repairOrderNumber: string | null;
  vehicleType: Enums<'vehicle_type'>;
  lines: RoLine[];
  partSuppliers: Record<string, string>;
  editable: boolean;
}) {
  const parts = lines.filter((line) => line.line_type === 'part');
  const [editing, setEditing] = useState<RoLine | 'new' | null>(null);
  const [deleting, setDeleting] = useState<RoLine | null>(null);
  const [returning, setReturning] = useState<RoLine | null>(null);
  const [coreLine, setCoreLine] = useState<string | null>(null);
  const cores = useRepairOrderCores(repairOrderId).data ?? {};
  const openCore = coreLine ? cores[coreLine] : undefined;
  const [pickingTires, setPickingTires] = useState(false);
  const remove = useRepairOrderMutation((line: RoLine) => deletePartLine(line.id), 'Pièce retirée');
  const nextPosition =
    Math.max(-1, ...lines.filter((line) => line.kind === 'done').map((line) => line.position)) + 1;
  const addTires = useRepairOrderMutation(
    (line: NewLine) => addStockTireLine(repairOrderId, nextPosition, line),
    'Pneus du stock ajoutés',
  );

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
          <span className="row flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setPickingTires(true)}>
              <CircleDot /> Pneu du stock
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
              <Plus /> Ajouter une pièce
            </Button>
          </span>
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
                core={cores[line.id]}
                editable={editable}
                onEdit={() => setEditing(line)}
                onDelete={() => setDeleting(line)}
                onReturn={() => setReturning(line)}
                onCore={() => setCoreLine(line.id)}
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
          core={editing === 'new' ? null : (cores[editing.id] ?? null)}
          nextPosition={nextPosition}
          onClose={() => setEditing(null)}
        />
      )}
      {pickingTires && (
        <TirePickDialog
          vehicleType={vehicleType}
          repairOrderId={repairOrderId}
          repairOrderNumber={repairOrderNumber}
          documentLabel="or"
          onAdd={(line) => addTires.mutateAsync(line)}
          onClose={() => setPickingTires(false)}
        />
      )}
      {openCore && <PartCoreDialog core={openCore} onClose={() => setCoreLine(null)} />}
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
