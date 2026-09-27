import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { saveConsumable, type Consumable } from './api';
import { consumablesKey, useCatalogMutation } from './hooks';
import { consumableFromForm, consumableSchema, consumableToForm, type ConsumableValues } from './schemas';
import { decimalValue } from '@/lib/numbers';

interface ConsumableDialogProps {
  /** Consommable modifié, ou `null` pour en créer un. */
  consumable: Consumable | null;
  onClose: () => void;
}

export function ConsumableDialog({ consumable, onClose }: ConsumableDialogProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConsumableValues>({
    resolver: zodResolver(consumableSchema),
    defaultValues: consumableToForm(consumable),
  });

  const save = useCatalogMutation(
    consumablesKey,
    (values: ConsumableValues) =>
      saveConsumable(consumable?.id ?? null, consumableFromForm(values), decimalValue(values.initial_stock)),
    consumable ? 'Consommable mis à jour' : 'Consommable créé',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{consumable ? 'Modifier le consommable' : 'Nouveau consommable'}</DialogTitle>
          <DialogDescription>
            Produit en vrac (huile, liquide de refroidissement, AdBlue…), prix HT par unité.
          </DialogDescription>
        </DialogHeader>
        <form
          id="consumable-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="consumable-name"
            label="Nom"
            placeholder="Huile moteur 10W40"
            error={errors.name?.message}
            {...register('name')}
          />
          <div className="grid grid-cols-3 gap-3">
            <FormField
              id="consumable-unit"
              label="Unité"
              error={errors.unit?.message}
              {...register('unit')}
            />
            <FormField
              id="consumable-sale"
              label="Vente HT / unité"
              inputMode="decimal"
              error={errors.sale_price?.message}
              {...register('sale_price')}
            />
            <FormField
              id="consumable-purchase"
              label="Achat HT / unité"
              inputMode="decimal"
              error={errors.purchase_price?.message}
              {...register('purchase_price')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!consumable && (
              <FormField
                id="consumable-initial"
                label="Stock de départ"
                inputMode="decimal"
                error={errors.initial_stock?.message}
                {...register('initial_stock')}
              />
            )}
            <FormField
              id="consumable-threshold"
              label="Seuil d’alerte"
              inputMode="decimal"
              placeholder="Ex : 40"
              error={errors.alert_threshold?.message}
              {...register('alert_threshold')}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="consumable-form" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
