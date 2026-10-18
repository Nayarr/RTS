import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleDot, ClipboardList, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { NewLine } from '@/features/documents/lines';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { Enums } from '@/types/database';
import { fetchInspection, fetchLotsForSize } from './api';
import { PROFILE_LABELS, formatTireSize, isTireSize, tireSizeKey, tiresCount } from './domain';
import { tiresKey } from './hooks';
import { inspectionPositions, lotDesignation, sortLots, tireCategory } from './pick';
import { Seg } from './Seg';

const MANUAL = 'autre';

const DOCUMENT = {
  devis: { to: 'au devis', this: 'ce devis' },
  facture: { to: 'à la facture', this: 'cette facture' },
} as const;

/**
 * Pneus du stock pour la taille relevée (P05) : les lots de la taille notée sur la fiche de contrôle
 * (ou tapée), le profil de la position d'abord. La ligne ajoutée est la pièce du lot : les pneus sont
 * réservés et sortent du stock quand la facture est émise.
 */
export function TirePickDialog({
  vehicleType,
  repairOrderId,
  repairOrderNumber,
  documentLabel,
  onAdd,
  onClose,
}: {
  vehicleType: Enums<'vehicle_type'>;
  repairOrderId: string | null;
  repairOrderNumber: string | null;
  documentLabel: 'devis' | 'facture';
  onAdd: (line: NewLine) => Promise<unknown>;
  onClose: () => void;
}) {
  const category = tireCategory(vehicleType);
  const doc = DOCUMENT[documentLabel];
  const inspection = useQuery({
    queryKey: [...tiresKey, 'inspection', repairOrderId],
    queryFn: () => fetchInspection(repairOrderId ?? ''),
    enabled: Boolean(repairOrderId),
  });
  const positions = inspectionPositions(inspection.data ?? null, vehicleType);
  const [chosen, setChosen] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [quantity, setQuantity] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const positionKey = chosen ?? positions[0]?.key ?? MANUAL;
  const position = positions.find((item) => item.key === positionKey) ?? null;
  const size = position?.size ?? typed;
  const profile = position?.profile ?? (category === 'vul' ? 'toutes' : 'avant');
  const count = Number(quantity ?? position?.quantity ?? 2);

  const lots = useQuery({
    queryKey: [...tiresKey, 'for-size', tireSizeKey(size), category],
    queryFn: () => fetchLotsForSize(tireSizeKey(size), category),
    enabled: isTireSize(size),
  });
  const options = sortLots(lots.data ?? [], profile).filter(
    (lot) => lot.available_qty > 0 || lot.stock_qty > 0,
  );
  const lot =
    options.find((item) => item.id === picked) ?? options.find((item) => item.available_qty >= count) ?? null;
  const total = lot?.sale_price === null || !lot ? null : Math.round(lot.sale_price * count * 100) / 100;

  const add = async () => {
    if (!lot || count <= 0) return;
    setSaving(true);
    try {
      await onAdd({
        line_type: 'part',
        description: lotDesignation(lot),
        quantity: count,
        unit_price: lot.sale_price,
        purchase_price: lot.purchase_price,
        brand: lot.brand_name,
        supplier_id: lot.supplier_id,
        part_id: lot.part_id,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const title = position
    ? `${position.label} (${position.state === 'HS' ? 'HS' : '50 %'}) · ${position.size}`
    : 'Pneus du stock';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {position
              ? `Taille relevée sur la fiche de contrôle${repairOrderNumber ? ` de l’${repairOrderNumber}` : ''}. Les forfaits roue, pneumatique et recyclage sont déjà ${doc.to} : choisis les pneus.`
              : 'Tape la taille du pneu (31580225) : les pneus du stock de cette taille sont proposés.'}
          </DialogDescription>
        </DialogHeader>

        {positions.length > 0 && (
          <Seg
            label="Position"
            className="w-fit max-w-full flex-wrap"
            value={positionKey}
            options={[
              ...positions.map((item) => ({ value: item.key, label: `${item.label} · ${item.size}` })),
              { value: MANUAL, label: 'Autre taille' },
            ]}
            onChange={(value) => {
              setChosen(value);
              setPicked(null);
              setQuantity(null);
            }}
          />
        )}
        {!position && (
          <Input
            aria-label="Taille du pneu"
            className="num"
            placeholder="31580225"
            autoFocus
            value={typed}
            onChange={(event) => {
              setTyped(formatTireSize(event.target.value));
              setPicked(null);
            }}
          />
        )}

        {isTireSize(size) && lots.isSuccess && options.length === 0 && (
          <p className="empty">
            Aucun pneu {size} en stock : ajoute la pièce à la main ou demande un chiffrage.
          </p>
        )}
        {options.length > 0 && (
          <div className="col gap-2" role="radiogroup" aria-label="Pneus du stock">
            {options.map((item) => {
              const selected = item.id === lot?.id;
              const short = item.available_qty < count;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${item.brand_name} ${item.model}`}
                  className={cn(
                    'row items-center gap-3 rounded-xl border px-4 py-3 text-left',
                    selected && 'border-primary bg-primary/10',
                  )}
                  onClick={() => setPicked(item.id)}
                >
                  <span
                    className={cn(
                      'size-4 shrink-0 rounded-full border',
                      selected && 'border-[5px] border-primary',
                    )}
                    aria-hidden
                  />
                  <CircleDot
                    className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')}
                  />
                  <span className="col min-w-0 flex-1">
                    <span className="row flex-wrap items-center gap-2">
                      <b>
                        {item.brand_name} {item.model}
                      </b>
                      <span className="badge text-xs">{PROFILE_LABELS[item.profile]}</span>
                    </span>
                    <span className={cn('text-xs', short ? 'down' : 'muted')}>
                      {short
                        ? `Stock insuffisant pour ${tiresCount(count)}`
                        : item.profile !== profile
                          ? `Profil ${PROFILE_LABELS[item.profile].toLowerCase()}`
                          : (item.location ?? '')}
                    </span>
                  </span>
                  <span className="col items-end">
                    <b className="num">{formatEuro(item.sale_price)} HT</b>
                    <span className={cn('text-xs', short ? 'down' : 'muted')}>
                      {item.available_qty} disponible{item.available_qty > 1 ? 's' : ''}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {lot && (
          <div className="grid items-end gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
            <label className="field">
              <span className="text-sm font-medium">Quantité</span>
              <Input
                aria-label="Quantité de pneus"
                className="num"
                inputMode="numeric"
                value={quantity ?? String(count)}
                onChange={(event) => setQuantity(event.target.value.replace(/\D/g, '').slice(0, 3))}
              />
            </label>
            <div className="col gap-0.5 text-[13.5px]">
              <b>Ligne ajoutée {doc.to}</b>
              <span className="muted">
                {lotDesignation(lot)} · {count} × {formatEuro(lot.sale_price)} = {formatEuro(total)} HT
              </span>
            </div>
          </div>
        )}
        {lot && (
          <p className="hint row items-center gap-1.5">
            <ClipboardList className="size-3.5 shrink-0" />
            Les {tiresCount(count)} sont réservés pour {doc.this} et sortent du stock quand la facture est
            émise.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Pas de pneu du stock
          </Button>
          <Button disabled={!lot || count <= 0 || saving} onClick={() => void add()}>
            <Plus /> Ajouter {doc.to}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
