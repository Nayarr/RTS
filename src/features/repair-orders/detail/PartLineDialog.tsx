import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
import { saveCatalogPart } from '@/features/catalogs/api';
import { MarginField } from '@/features/catalogs/MarginField';
import { PartSuggestions } from '@/features/catalogs/PartSuggestions';
import { marginPercent } from '@/lib/margin';
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
import { useQueryClient } from '@tanstack/react-query';
import { partsKey } from '@/features/catalogs/hooks';

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
    setValue,
    reset,
    formState: { errors },
  } = useForm<PartLineValues>({
    resolver: zodResolver(partLineSchema),
    defaultValues: partLineToForm(line, supplierName),
  });

  // Pièce reprise de la base : plus de propositions pendant la saisie
  const [picked, setPicked] = useState(false);
  const queryClient = useQueryClient();
  const [description, quantity, unitPrice, purchasePrice] = useWatch({
    control,
    name: ['description', 'quantity', 'unit_price', 'purchase_price'],
  });

  const save = useRepairOrderMutation(
    async (values: PartLineValues) => {
      const input = partLineFromForm(values);
      // Gardée au catalogue : même désignation, référence et marque → prix mis à jour ; sinon nouvelle pièce
      const partId = await saveCatalogPart({
        designation: input.description,
        manufacturer_ref: input.manufacturer_ref,
        oem_ref: input.oem_ref,
        brand: input.brand,
        supplier_name: input.supplier_name,
        // Référence véhicule laissée vide : celle de la base est gardée
        ...(values.vehicle_ref.trim() ? { vehicle_ref: values.vehicle_ref.trim() } : {}),
        purchase_price: input.purchase_price,
        sale_price: input.unit_price,
        margin_kind: 'percent',
        margin_value: marginPercent(input.purchase_price, input.unit_price),
      });
      // Nouvelle pièce ou nouveaux prix : proposés tout de suite à la prochaine saisie
      await queryClient.invalidateQueries({ queryKey: partsKey });
      const withPart = { ...input, part_id: partId };
      return line ? updatePartLine(line.id, withPart) : addPartLine(repairOrderId, nextPosition, withPart);
    },
    line ? 'Pièce mise à jour' : 'Pièce ajoutée',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{line ? 'Modifier la pièce' : 'Ajouter une pièce'}</DialogTitle>
          <DialogDescription>Pièce fournie pour cette intervention, facturée avec l’OR.</DialogDescription>
        </DialogHeader>

        <form
          id="part-line-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <div className="space-y-2">
            <FormField
              id="part-line-description"
              label="Désignation"
              autoComplete="off"
              placeholder="Désignation ou référence"
              error={errors.description?.message}
              {...register('description')}
            />
            <PartSuggestions
              text={description}
              hidden={picked || line !== null}
              onPick={(part) => {
                setPicked(true);
                reset(partFromCatalog(part, getValues()));
              }}
            />
          </div>
          {/* Mêmes champs, même ordre que la pièce ajoutée à un devis (PartFields) */}
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              id="part-line-vehicle-ref"
              label="Référence véhicule"
              placeholder="Ex : Volvo FH 500"
              {...register('vehicle_ref')}
            />
            <FormField
              id="part-line-manufacturer-ref"
              label="Réf. fabricant"
              className="num"
              {...register('manufacturer_ref')}
            />
            <FormField
              id="part-line-oem-ref"
              label="Réf. constructeur"
              className="num"
              {...register('oem_ref')}
            />
            <FormField id="part-line-brand" label="Marque" {...register('brand')} />
            <FormField id="part-line-supplier" label="Fournisseur" {...register('supplier_name')} />
            <FormField
              id="part-line-purchase"
              label="Prix d’achat HT (€)"
              inputMode="decimal"
              className="num"
              error={errors.purchase_price?.message}
              {...register('purchase_price')}
            />
            <FormField
              id="part-line-shipping"
              label="Frais de port HT (€)"
              inputMode="decimal"
              className="num"
              error={errors.shipping_cost?.message}
              {...register('shipping_cost')}
            />
            <FormField
              id="part-line-sale"
              label="Prix de vente HT (€)"
              inputMode="decimal"
              className="num"
              error={errors.unit_price?.message}
              {...register('unit_price')}
            />
            <MarginField
              id="part-line-margin"
              purchase={purchasePrice}
              sale={unitPrice}
              quantity={quantity}
              onSale={(sale) => setValue('unit_price', sale, { shouldDirty: true, shouldValidate: true })}
            />
          </div>
          <FormField
            id="part-line-quantity"
            label="Quantité"
            inputMode="decimal"
            className="num sm:max-w-[10rem]"
            error={errors.quantity?.message}
            {...register('quantity')}
          />
          <Controller
            control={control}
            name="order_status"
            render={({ field }) => (
              <div className="space-y-2">
                <Label htmlFor="part-line-order-status">Commande</Label>
                <select
                  id="part-line-order-status"
                  className="inp"
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
