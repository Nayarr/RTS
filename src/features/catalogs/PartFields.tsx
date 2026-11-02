import type { ReactNode } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { MarginField } from './MarginField';
import type { PartValues } from './schemas';

/**
 * Champs d'une pièce : références, prix d'achat, frais de port, prix de vente HT et marge. Mêmes champs
 * et même ordre dans la fenêtre des pièces de l'OR (PartLineDialog).
 * La marge se calcule depuis les deux prix ; modifiée, elle recalcule le prix de vente.
 */
export function PartFields({
  form,
  idPrefix,
  designation,
  quantity,
}: {
  form: UseFormReturn<PartValues>;
  idPrefix: string;
  /** Champ « Désignation » remplacé (ex. avec propositions de la base). */
  designation?: ReactNode;
  /** Quantité de la ligne : affiche son total HT. */
  quantity?: string;
}) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const values = useWatch({ control });

  return (
    <div className="space-y-4">
      {designation ?? (
        <FormField
          id={`${idPrefix}-designation`}
          label="Désignation"
          error={errors.designation?.message}
          {...register('designation')}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          id={`${idPrefix}-vehicle-ref`}
          label="Référence véhicule"
          placeholder="Ex : Volvo FH 500"
          {...register('vehicle_ref')}
        />
        <FormField
          id={`${idPrefix}-part-ref`}
          label="Réf. fabricant"
          className="num"
          {...register('manufacturer_ref')}
        />
        <FormField
          id={`${idPrefix}-oem-ref`}
          label="Réf. constructeur"
          className="num"
          {...register('oem_ref')}
        />
        <FormField id={`${idPrefix}-brand`} label="Marque" {...register('brand')} />
        <FormField id={`${idPrefix}-supplier`} label="Fournisseur" {...register('supplier_name')} />
        <FormField
          id={`${idPrefix}-purchase`}
          label="Prix d’achat HT (€)"
          inputMode="decimal"
          className="num"
          error={errors.purchase_price?.message}
          {...register('purchase_price')}
        />
        <FormField
          id={`${idPrefix}-shipping`}
          label="Frais de port HT (€)"
          inputMode="decimal"
          className="num"
          error={errors.shipping_cost?.message}
          {...register('shipping_cost')}
        />
        <FormField
          id={`${idPrefix}-sale`}
          label="Prix de vente HT (€)"
          inputMode="decimal"
          className="num"
          error={errors.sale_price?.message}
          {...register('sale_price')}
        />
        <MarginField
          id={`${idPrefix}-margin`}
          purchase={values.purchase_price ?? ''}
          sale={values.sale_price ?? ''}
          onSale={(sale) => setValue('sale_price', sale, { shouldDirty: true, shouldValidate: true })}
          {...(quantity === undefined ? {} : { quantity })}
        />
      </div>
    </div>
  );
}
