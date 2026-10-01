import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pickDirty } from '@/lib/forms';
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
      <div className="-mx-[22px] -my-5 overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="pl-[22px]!">Catégorie</th>
              <th>Libellé sur les documents</th>
              <th className="r w-40">Taux HT (€/h)</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, index) => {
              const rowErrors = errors.rates?.[index];
              const error =
                rowErrors?.label?.message ??
                rowErrors?.labor_line_label?.message ??
                rowErrors?.hourly_rate?.message;
              return (
                <tr key={field.id}>
                  <td className="pl-[22px]!">
                    <input
                      className="inp min-w-48 font-semibold"
                      aria-label={`Catégorie : ${field.label}`}
                      aria-invalid={rowErrors?.label ? true : undefined}
                      {...register(`rates.${index}.label`)}
                    />
                  </td>
                  <td>
                    <input
                      className="inp min-w-64"
                      aria-label={`Libellé sur les documents : ${field.label}`}
                      aria-invalid={rowErrors?.labor_line_label ? true : undefined}
                      {...register(`rates.${index}.labor_line_label`)}
                    />
                    {error && <p className="err mt-1">{error}</p>}
                  </td>
                  <td>
                    <input
                      className="inp num text-right"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`Taux HT (€/h) : ${field.label}`}
                      aria-invalid={rowErrors?.hourly_rate ? true : undefined}
                      {...register(`rates.${index}.hourly_rate`, { valueAsNumber: true })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
