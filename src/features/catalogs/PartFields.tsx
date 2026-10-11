import type { ReactNode } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { formSalePrice, type PartValues } from './schemas';

/**
 * Champs d'une pièce : références, prix d'achat, frais de port et marge (montant ou %).
 * Le prix de vente HT est calculé dès qu'une marge est saisie ; sans marge, il se saisit.
 */
export function PartFields({
  form,
  idPrefix,
  designation,
}: {
  form: UseFormReturn<PartValues>;
  idPrefix: string;
  /** Champ « Désignation » remplacé (ex. avec propositions de la base). */
  designation?: ReactNode;
}) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;
  const values = useWatch({ control });
  const kind = values.margin_kind ?? 'percent';
  const computed = formSalePrice({
    purchase_price: values.purchase_price ?? '',
    shipping_cost: values.shipping_cost ?? '',
    margin_kind: kind,
    margin_value: values.margin_value ?? '',
    sale_price: values.sale_price ?? '',
  });
  const hasMargin = (values.margin_value ?? '').trim() !== '';

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
          label="Référence pièce"
          className="num"
          {...register('manufacturer_ref')}
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
        <div className="field">
          <Label htmlFor={`${idPrefix}-margin`}>{kind === 'percent' ? 'Marge (%)' : 'Marge (€)'}</Label>
          <div className="flex items-center gap-2">
            <div className="seg shrink-0" role="group" aria-label="Type de marge">
              {(
                [
                  ['percent', '%'],
                  ['amount', '€'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(kind === value && 'on')}
                  aria-pressed={kind === value}
                  aria-label={value === 'percent' ? 'Marge en pourcentage' : 'Marge en euros'}
                  onClick={() => setValue('margin_kind', value, { shouldDirty: true })}
                >
                  {label}
                </button>
              ))}
            </div>
            <Input
              id={`${idPrefix}-margin`}
              inputMode="decimal"
              className="num"
              placeholder={kind === 'percent' ? 'Ex : 30' : 'Ex : 25'}
              aria-invalid={errors.margin_value ? true : undefined}
              {...register('margin_value')}
            />
          </div>
          {errors.margin_value && <p className="err">{errors.margin_value.message}</p>}
        </div>
        {hasMargin ? (
          <div className="field">
            <span className="text-sm font-medium">Prix de vente HT</span>
            <output
              aria-label="Prix de vente HT calculé"
              className="num flex h-10 items-center text-lg font-semibold"
            >
              {computed === null ? 'Saisis le prix d’achat' : formatEuro(computed)}
            </output>
          </div>
        ) : (
          <FormField
            id={`${idPrefix}-sale`}
            label="Prix de vente HT (€)"
            inputMode="decimal"
            className="num"
            error={errors.sale_price?.message}
            {...register('sale_price')}
          />
        )}
      </div>
    </div>
  );
}
