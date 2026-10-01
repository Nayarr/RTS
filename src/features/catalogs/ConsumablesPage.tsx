import { useState } from 'react';
import { ClipboardCheck, Pencil, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatEuro, formatQuantity } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { removeConsumable, type Consumable } from './api';
import { CatalogTabs } from './CatalogTabs';
import { ConsumableDialog } from './ConsumableDialog';
import { consumablesKey, useCatalogMutation, useConsumables } from './hooks';
import { isLowStock } from './schemas';
import { StockDialog, type StockAction } from './StockDialog';

function ConsumableRow({
  consumable,
  onEdit,
  onStock,
  onRemove,
}: {
  consumable: Consumable;
  onEdit: () => void;
  onStock: (action: StockAction) => void;
  onRemove: () => void;
}) {
  const low = isLowStock(consumable);
  const threshold = consumable.alert_threshold ?? 0;
  // Jauge : le seuil d'alerte au tiers de la barre.
  const fill = threshold > 0 ? Math.min(100, (consumable.stock_qty / (threshold * 3)) * 100) : 100;
  return (
    <tr aria-label={consumable.name}>
      <td>
        <span className="c2">
          <b>{consumable.name}</b>
          <span>{consumable.unit}</span>
        </span>
      </td>
      <td>
        <div className="col gap-[5px]">
          <div className="row between">
            <b className="num">
              {formatQuantity(consumable.stock_qty)} {consumable.unit}
            </b>
            {low ? (
              <span className="down b text-xs">Stock bas (seuil {formatQuantity(threshold)})</span>
            ) : threshold > 0 ? (
              <span className="hint">seuil {formatQuantity(threshold)}</span>
            ) : null}
          </div>
          <div className={cn('bar', low ? 's-bad' : 's-ok')} aria-hidden>
            <i style={{ width: `${fill}%` }} />
          </div>
        </div>
      </td>
      <td className="r num">{formatEuro(consumable.purchase_price)}</td>
      <td className="r num b">{formatEuro(consumable.sale_price)}</td>
      <td className="r">
        <div className="row justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => onStock('restock')}>
            <PackagePlus /> Réappro
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onStock('inventory')}>
            <ClipboardCheck /> Inventaire
          </Button>
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label={`Modifier ${consumable.name}`}
            onClick={onEdit}
          >
            <Pencil className="i s" />
          </button>
          <button
            type="button"
            className="ibtn sm ghost text-destructive"
            aria-label={`Retirer ${consumable.name}`}
            onClick={onRemove}
          >
            <Trash2 className="i s" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Consommables en vrac : prix, stock, réapprovisionnement et inventaire (direction). */
export function ConsumablesPage() {
  const consumables = useConsumables();
  const [editing, setEditing] = useState<Consumable | 'new' | null>(null);
  const [stock, setStock] = useState<{ consumable: Consumable; action: StockAction } | null>(null);
  const [removing, setRemoving] = useState<Consumable | null>(null);

  const remove = useCatalogMutation(
    consumablesKey,
    (consumable: Consumable) => removeConsumable(consumable.id),
    (result, consumable) =>
      result === 'archived'
        ? `${consumable.name} archivé (déjà utilisé sur des OR)`
        : `${consumable.name} supprimé`,
  );

  const lowCount = (consumables.data ?? []).filter(isLowStock).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Stock et catalogues' }, { label: 'Consommables' }]}
        title="Consommables"
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Nouveau consommable
          </Button>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CatalogTabs />
          {lowCount > 0 && (
            <span className="badge s-bad dot h-[30px]">
              {lowCount} produit{lowCount > 1 ? 's' : ''} sous le seuil d’alerte
            </span>
          )}
        </div>

        {consumables.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {consumables.isError && <p className="text-destructive">Impossible de charger les consommables.</p>}
        {consumables.data?.length === 0 && (
          <p className="empty">
            Aucun consommable. Ajoute par exemple « Huile moteur 10W40 », « Liquide de refroidissement », «
            AdBlue ».
          </p>
        )}
        {consumables.data && consumables.data.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl" aria-label="Consommables">
              <thead>
                <tr>
                  <th>Produit</th>
                  <th className="w-[280px]">Stock</th>
                  <th className="r">Achat HT / unité</th>
                  <th className="r">Vente HT / unité</th>
                  <th className="r">Actions</th>
                </tr>
              </thead>
              <tbody>
                {consumables.data.map((consumable) => (
                  <ConsumableRow
                    key={consumable.id}
                    consumable={consumable}
                    onEdit={() => setEditing(consumable)}
                    onStock={(action) => setStock({ consumable, action })}
                    onRemove={() => setRemoving(consumable)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ConsumableDialog consumable={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      {stock && <StockDialog {...stock} onClose={() => setStock(null)} />}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Retirer ${removing?.name ?? ''} ?`}
        description="Il ne sera plus proposé sur les OR. S’il a déjà été utilisé, il est archivé pour garder l’historique."
        confirmLabel="Retirer"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing, { onSuccess: () => setRemoving(null) })}
      />
    </>
  );
}
