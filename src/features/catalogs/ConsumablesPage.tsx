import { useState } from 'react';
import { ClipboardCheck, Pencil, PackagePlus, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  return (
    <Card aria-label={consumable.name} role="article">
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold">{consumable.name}</p>
          <p className="text-sm text-muted-foreground">
            Vente {formatEuro(consumable.sale_price)} HT / {consumable.unit} · achat{' '}
            {formatEuro(consumable.purchase_price)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className={cn('text-xl font-bold tabular-nums', low && 'text-destructive')}>
            {formatQuantity(consumable.stock_qty)} {consumable.unit}
          </p>
          {low && (
            <p className="flex items-center justify-end gap-1 text-sm text-destructive">
              <TriangleAlert className="size-4" /> Stock bas (seuil{' '}
              {formatQuantity(consumable.alert_threshold ?? 0)})
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" onClick={() => onStock('restock')}>
            <PackagePlus /> Réappro
          </Button>
          <Button variant="ghost" onClick={() => onStock('inventory')}>
            <ClipboardCheck /> Inventaire
          </Button>
          <Button variant="ghost" size="icon" aria-label={`Modifier ${consumable.name}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            aria-label={`Retirer ${consumable.name}`}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        </div>
      </CardContent>
    </Card>
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

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Stock et catalogues</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus /> Nouveau consommable
        </Button>
      </div>
      <CatalogTabs />

      {consumables.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {consumables.isError && <p className="text-destructive">Impossible de charger les consommables.</p>}
      {consumables.data?.length === 0 && (
        <p className="py-10 text-center text-muted-foreground">
          Aucun consommable. Ajoute par exemple « Huile moteur 10W40 », « Liquide de refroidissement », «
          AdBlue ».
        </p>
      )}
      <div className="space-y-3">
        {consumables.data?.map((consumable) => (
          <ConsumableRow
            key={consumable.id}
            consumable={consumable}
            onEdit={() => setEditing(consumable)}
            onStock={(action) => setStock({ consumable, action })}
            onRemove={() => setRemoving(consumable)}
          />
        ))}
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
    </div>
  );
}
