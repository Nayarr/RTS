import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { consumablesKey, useConsumables } from '@/features/catalogs/hooks';
import { decimalValue, formatEuro, formatQuantity } from '@/lib/numbers';
import { useRepairOrderMutation } from '../hooks';
import { consumableUseSchema, type ConsumableUseValues } from '../supplies';
import { addRoConsumable, deleteRoConsumable, type RoConsumable } from '../supplies-api';

/** Le stock change avec l'OR : la liste des consommables est rechargée. */
function useStockRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: consumablesKey });
}

function AddConsumableDialog({ repairOrderId, onClose }: { repairOrderId: string; onClose: () => void }) {
  const consumables = useConsumables();
  const refreshStock = useStockRefresh();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConsumableUseValues>({
    resolver: zodResolver(consumableUseSchema),
    defaultValues: { consumable_id: '', quantity: '' },
  });

  const add = useRepairOrderMutation(async (values: ConsumableUseValues) => {
    const consumable = consumables.data?.find((item) => item.id === values.consumable_id);
    if (!consumable) throw new Error('Produit introuvable');
    await addRoConsumable(repairOrderId, consumable, decimalValue(values.quantity) ?? 0);
    await refreshStock();
  }, 'Consommable ajouté');

  const list = consumables.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Consommable utilisé</DialogTitle>
          <DialogDescription>La quantité est déduite du stock et facturée avec l’OR.</DialogDescription>
        </DialogHeader>
        {consumables.isSuccess && list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun consommable défini : la direction les crée dans Stock → Consommables.
          </p>
        ) : (
          <form
            id="consumable-use-form"
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit((values) => add.mutate(values, { onSuccess: onClose }))}
          >
            <Controller
              control={control}
              name="consumable_id"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label htmlFor="consumable-use-product">Produit</Label>
                  <select
                    id="consumable-use-product"
                    className="h-11 w-full rounded-md border bg-transparent px-3 text-base"
                    aria-invalid={errors.consumable_id ? true : undefined}
                    value={field.value}
                    onChange={field.onChange}
                  >
                    <option value="">— Choisir —</option>
                    {list.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({formatQuantity(item.stock_qty)} {item.unit} en stock)
                      </option>
                    ))}
                  </select>
                  {errors.consumable_id && (
                    <p className="text-sm text-destructive">{errors.consumable_id.message}</p>
                  )}
                </div>
              )}
            />
            <FormField
              id="consumable-use-quantity"
              label="Quantité"
              inputMode="decimal"
              placeholder="Ex : 32"
              error={errors.quantity?.message}
              {...register('quantity')}
            />
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="consumable-use-form" disabled={add.isPending || list.length === 0}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConsumableRow({ item, editable }: { item: RoConsumable; editable: boolean }) {
  const refreshStock = useStockRefresh();
  const remove = useRepairOrderMutation(async () => {
    await deleteRoConsumable(item.id);
    await refreshStock();
  }, `${item.name} retiré (remis en stock)`);

  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span>
        {item.name} — <strong>{`${formatQuantity(item.quantity)} ${item.unit}`}</strong>
        <span className="text-sm text-muted-foreground">
          {' '}
          · {formatEuro(item.unit_sale_price * item.quantity)} HT
        </span>
      </span>
      {editable && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Retirer ${item.name}`}
          disabled={remove.isPending}
          onClick={() => remove.mutate(undefined)}
        >
          <X />
        </Button>
      )}
    </li>
  );
}

/** Huile, liquide, AdBlue… utilisés sur l'OR (déduits du stock). */
export function ConsumablesCard({
  repairOrderId,
  consumables,
  editable,
}: {
  repairOrderId: string;
  consumables: RoConsumable[];
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Consommables (vrac)</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {consumables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun consommable noté.</p>
        ) : (
          <ul className="divide-y">
            {consumables.map((item) => (
              <ConsumableRow key={item.id} item={item} editable={editable} />
            ))}
          </ul>
        )}
      </CardContent>
      {editable && (
        <CardFooter>
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Ajouter huile / liquide / AdBlue…
          </Button>
        </CardFooter>
      )}
      {adding && <AddConsumableDialog repairOrderId={repairOrderId} onClose={() => setAdding(false)} />}
    </Card>
  );
}
