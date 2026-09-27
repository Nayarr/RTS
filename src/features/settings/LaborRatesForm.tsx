import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pickDirty } from '@/lib/forms';
import { FormField } from '@/components/FormField';
import { updateLaborRates, type LaborRate } from './api';
import { useSaveSettings } from './hooks';
import { laborRatesSchema, laborRatesToForm, type LaborRatesValues } from './schemas';
import { SectionCard } from '@/components/SectionCard';

/** Taux horaires HT par catégorie de véhicule / travaux. */
export function LaborRatesForm({ rates }: { rates: LaborRate[] }) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<LaborRatesValues>({ resolver: zodResolver(laborRatesSchema), values: laborRatesToForm(rates) });
  const { fields } = useFieldArray({ control, name: 'rates' });

  const save = useSaveSettings(
    (values: LaborRatesValues) =>
      updateLaborRates(
        values.rates
          .map((rate, index) => ({ category: rate.category, ...pickDirty(rate, dirtyFields.rates?.[index]) }))
          .filter((rate) => Object.keys(rate).length > 1),
      ),
    'Taux horaires enregistrés',
  );

  return (
    <SectionCard
      id="labor-rates-form"
      title="Taux horaires"
      description="Prix HT de l’heure de main d’œuvre, et libellé de la ligne sur les devis et factures."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      {fields.map((field, index) => {
        const rowErrors = errors.rates?.[index];
        return (
          <fieldset key={field.id} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[10rem_1fr_9rem]">
            <legend className="px-1 text-sm font-semibold">{field.label}</legend>
            <FormField
              id={`rates-${index}-label`}
              label="Catégorie"
              error={rowErrors?.label?.message}
              {...register(`rates.${index}.label`)}
            />
            <FormField
              id={`rates-${index}-line`}
              label="Libellé sur les documents"
              error={rowErrors?.labor_line_label?.message}
              {...register(`rates.${index}.labor_line_label`)}
            />
            <FormField
              id={`rates-${index}-rate`}
              label="Taux HT (€/h)"
              type="number"
              step="0.01"
              inputMode="decimal"
              error={rowErrors?.hourly_rate?.message}
              {...register(`rates.${index}.hourly_rate`, { valueAsNumber: true })}
            />
          </fieldset>
        );
      })}
    </SectionCard>
  );
}
