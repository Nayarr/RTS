import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { pickDirty } from '@/lib/forms';
import { parseDecimal } from '@/lib/numbers';
import { addLaborRate, deleteLaborRate, updateLaborRates, type LaborRate } from './api';
import { useSaveSettings } from './hooks';
import { laborRatesSchema, laborRatesToForm, type LaborRatesValues } from './schemas';
import { SectionCard } from '@/components/SectionCard';

/** Nouveau type de main d'œuvre : catégorie affichée, libellé des documents, prix de l'heure. */
function NewRateRow() {
  const [label, setLabel] = useState('');
  const [lineLabel, setLineLabel] = useState('');
  const [rate, setRate] = useState('');
  const hourly = parseDecimal(rate);
  const valid =
    label.trim().length > 0 &&
    label.trim().length <= 40 &&
    lineLabel.trim().length > 0 &&
    lineLabel.trim().length <= 120 &&
    hourly !== null &&
    !Number.isNaN(hourly) &&
    hourly >= 0;
  const add = useSaveSettings(
    () => addLaborRate({ label: label.trim(), labor_line_label: lineLabel.trim(), hourly_rate: hourly ?? 0 }),
    'Type de main d’œuvre ajouté',
  );
  return (
    <tr>
      <td className="pl-[22px]!">
        <input
          className="inp min-w-48 font-semibold"
          aria-label="Nouveau type : catégorie"
          placeholder="Ex : Électricité"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </td>
      <td>
        <input
          className="inp min-w-64"
          aria-label="Nouveau type : libellé sur les documents"
          placeholder="Ex : Main d’œuvre électricité"
          value={lineLabel}
          onChange={(event) => setLineLabel(event.target.value)}
        />
      </td>
      <td>
        <input
          className="inp num text-right"
          inputMode="decimal"
          aria-label="Nouveau type : taux HT (€/h)"
          placeholder="85"
          value={rate}
          onChange={(event) => setRate(event.target.value)}
        />
      </td>
      <td className="pr-[22px]!">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!valid || add.isPending}
          onClick={() =>
            add.mutate(undefined, {
              onSuccess: () => {
                setLabel('');
                setLineLabel('');
                setRate('');
              },
            })
          }
        >
          <Plus /> Ajouter
        </Button>
      </td>
    </tr>
  );
}

/**
 * Taux horaires HT : les quatre taux de base (poids lourds, VUL, remorque, tôlerie) et les types de
 * main d'œuvre ajoutés par la direction, proposés à l'ajout de main d'œuvre sur un devis ou une facture.
 */
export function LaborRatesForm({ rates }: { rates: LaborRate[] }) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<LaborRatesValues>({ resolver: zodResolver(laborRatesSchema), values: laborRatesToForm(rates) });
  const { fields } = useFieldArray({ control, name: 'rates', keyName: 'key' });
  const [removing, setRemoving] = useState<{ id: string; label: string } | null>(null);

  const save = useSaveSettings(
    (values: LaborRatesValues) =>
      updateLaborRates(
        values.rates
          .map((rate, index) => ({ id: rate.id, ...pickDirty(rate, dirtyFields.rates?.[index]) }))
          .filter((rate) => Object.keys(rate).length > 1),
      ),
    'Taux horaires enregistrés',
  );
  const remove = useSaveSettings((id: string) => deleteLaborRate(id), 'Type de main d’œuvre supprimé');

  return (
    <SectionCard
      id="labor-rates-form"
      title="Taux horaires"
      description="Prix HT de l’heure de main d’œuvre, et libellé de la ligne sur les devis et factures. Ajoute tes propres types (électricité, diagnostic…) : ils sont proposés à l’ajout de main d’œuvre."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <div className="relative -mx-[22px] -my-5 overflow-x-auto">
        <table className="tbl min-w-[820px]">
          <thead>
            <tr>
              <th className="pl-[22px]!">Catégorie</th>
              <th>Libellé sur les documents</th>
              <th className="r w-40">Taux HT (€/h)</th>
              <th className="w-28 pr-[22px]!">
                <span className="sr-only">Supprimer</span>
              </th>
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
                <tr key={field.key}>
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
                  <td className="pr-[22px]!">
                    {field.category === null ? (
                      <button
                        type="button"
                        className="ibtn sm ghost"
                        aria-label={`Supprimer le type : ${field.label}`}
                        onClick={() => setRemoving({ id: field.id, label: field.label })}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span className="hint" title="Taux par défaut d’un type de véhicule">
                        De base
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            <NewRateRow />
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Supprimer ce type de main d’œuvre ?"
        description={`${removing?.label ?? ''} : il n’est plus proposé ; les devis et factures déjà faits gardent leur prix.`}
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })}
      />
    </SectionCard>
  );
}
