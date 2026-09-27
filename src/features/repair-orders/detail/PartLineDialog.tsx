import { Controller, useForm } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import { CatalogPicker } from '@/features/catalogs/CatalogPicker';
import type { RoLine } from '../api';
import { useRepairOrderMutation } from '../hooks';
import {
  PART_ORDER_META,
  partFromCatalog,
  partLineFromForm,
  partLineSchema,
  partLineToForm,
  type PartLineValues,
} from '../supplies';
import { addPartLine, updatePartLine } from '../supplies-api';

interface PartLineDialogProps {
  repairOrderId: string;
  /** Pièce modifiée, ou `null` pour en ajouter une. */
  line: RoLine | null;
  supplierName: string | null;
  nextPosition: number;
  onClose: () => void;
}

export function PartLineDialog({
  repairOrderId,
  line,
  supplierName,
  nextPosition,
  onClose,
}: PartLineDialogProps) {
  const {
    control,
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<PartLineValues>({
    resolver: zodResolver(partLineSchema),
    defaultValues: partLineToForm(line, supplierName),
  });

  const save = useRepairOrderMutation(
    (values: PartLineValues) =>
      line
        ? updatePartLine(line.id, partLineFromForm(values))
        : addPartLine(repairOrderId, nextPosition, partLineFromForm(values)),
    line ? 'Pièce mise à jour' : 'Pièce ajoutée',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{line ? 'Modifier la pièce' : 'Ajouter une pièce'}</DialogTitle>
          <DialogDescription>Pièce fournie pour cette intervention, facturée avec l’OR.</DialogDescription>
        </DialogHeader>

        {!line && <CatalogPicker onPick={(part) => reset(partFromCatalog(part, getValues()))} />}

        <form
          id="part-line-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <FormField
            id="part-line-description"
            label="Désignation"
            error={errors.description?.message}
            {...register('description')}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField
              id="part-line-quantity"
              label="Quantité"
              inputMode="decimal"
              error={errors.quantity?.message}
              {...register('quantity')}
            />
            <FormField
              id="part-line-sale"
              label="Vente HT (€)"
              inputMode="decimal"
              error={errors.unit_price?.message}
              {...register('unit_price')}
            />
            <FormField
              id="part-line-purchase"
              label="Achat HT (€)"
              inputMode="decimal"
              error={errors.purchase_price?.message}
              {...register('purchase_price')}
            />
            <FormField
              id="part-line-shipping"
              label="Port (€)"
              inputMode="decimal"
              error={errors.shipping_cost?.message}
              {...register('shipping_cost')}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="part-line-supplier" label="Fournisseur" {...register('supplier_name')} />
            <FormField id="part-line-brand" label="Marque" {...register('brand')} />
            <FormField
              id="part-line-manufacturer-ref"
              label="Réf. fabricant"
              {...register('manufacturer_ref')}
            />
            <FormField id="part-line-oem-ref" label="Réf. constructeur" {...register('oem_ref')} />
          </div>
          <Controller
            control={control}
            name="order_status"
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="part-line-order-status">Commande</Label>
                <select
                  id="part-line-order-status"
                  className="h-11 w-full rounded-md border bg-transparent px-3 text-base"
                  value={field.value}
                  onChange={field.onChange}
                >
                  {Object.entries(PART_ORDER_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          />
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="part-line-form" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
