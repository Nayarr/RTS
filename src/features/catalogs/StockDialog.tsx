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
import { decimalValue, formatQuantity } from '@/lib/numbers';
import { restockConsumable, setConsumableStock, type Consumable } from './api';
import { consumablesKey, useCatalogMutation } from './hooks';
import { stockSchema, type StockValues } from './schemas';

export type StockAction = 'restock' | 'inventory';

const COPY = {
  restock: {
    title: 'Réapprovisionnement',
    label: 'Quantité reçue',
    description: 'La quantité s’ajoute au stock.',
    success: 'Stock réapprovisionné',
  },
  inventory: {
    title: 'Inventaire',
    label: 'Stock compté',
    description: 'Le stock est remplacé par la quantité comptée ; l’écart est gardé dans le journal.',
    success: 'Stock corrigé',
  },
} as const;

interface StockDialogProps {
  consumable: Consumable;
  action: StockAction;
  onClose: () => void;
}

/** Entrée en stock ou correction après comptage (jamais de saisie directe du stock). */
export function StockDialog({ consumable, action, onClose }: StockDialogProps) {
  const copy = COPY[action];
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StockValues>({
    resolver: zodResolver(stockSchema(action === 'restock')),
    defaultValues: { quantity: '', note: '' },
  });

  const save = useCatalogMutation(
    consumablesKey,
    ({ quantity, note }: StockValues) => {
      const value = decimalValue(quantity) ?? 0;
      const comment = note.trim() || null;
      return action === 'restock'
        ? restockConsumable(consumable.id, value, comment)
        : setConsumableStock(consumable.id, value, comment);
    },
    copy.success,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {copy.title} · {consumable.name}
          </DialogTitle>
          <DialogDescription>
            Stock actuel : {formatQuantity(consumable.stock_qty)} {consumable.unit}. {copy.description}
          </DialogDescription>
        </DialogHeader>
        <form
          id="stock-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="stock-quantity"
            label={`${copy.label} (${consumable.unit})`}
            inputMode="decimal"
            autoFocus
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <FormField
            id="stock-note"
            label="Commentaire (facultatif)"
            placeholder={action === 'restock' ? 'Ex : livraison fût 208 L' : 'Ex : inventaire mensuel'}
            {...register('note')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="stock-form" disabled={save.isPending}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
