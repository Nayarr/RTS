import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { UserPlus } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Label } from '@/components/ui/label';
import type { NewClientValues } from '@/features/customers/domain';
import { cn } from '@/lib/utils';

/**
 * Client pas encore en base : sa fiche se remplit dans l'OR (tous les champs obligatoires).
 * L'e-mail saisi ici sert ensuite aux envois (signature à distance, devis, facture).
 */
export function NewClientFields({
  form,
  onKindChange,
}: {
  form: UseFormReturn<NewClientValues>;
  onKindChange: (kind: NewClientValues['kind']) => void;
}) {
  const {
    control,
    register,
    formState: { errors },
  } = form;
  const kind = useWatch({ control, name: 'kind' });

  return (
    <div
      className="col gap-3.5 rounded-[9px] border border-dashed p-3.5"
      aria-labelledby="new-ro-client-title"
    >
      <div className="row wrap justify-between gap-2">
        <span className="row gap-1.5 text-[13.5px] font-semibold" id="new-ro-client-title">
          <UserPlus className="i xs" /> Nouveau client : fiche à compléter
        </span>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <div className="seg" role="group" aria-label="Type de client">
              {(
                [
                  ['pro', 'Professionnel'],
                  ['individual', 'Particulier'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(field.value === value && 'on')}
                  aria-pressed={field.value === value}
                  onClick={() => onKindChange(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        />
      </div>

      <div className="grid gap-3.5 sm:grid-cols-3">
        {kind === 'individual' ? (
          <>
            <div className="field">
              <Label htmlFor="new-ro-client-civility">Civilité *</Label>
              <select
                id="new-ro-client-civility"
                className="inp"
                aria-invalid={errors.civility ? true : undefined}
                {...register('civility')}
              >
                <option value="">-</option>
                <option value="Mme">Mme</option>
                <option value="M.">M.</option>
              </select>
              {errors.civility && <p className="err">{errors.civility.message}</p>}
            </div>
            <FormField
              id="new-ro-client-last-name"
              label="Nom *"
              error={errors.last_name?.message}
              {...register('last_name')}
            />
            <FormField
              id="new-ro-client-first-name"
              label="Prénom *"
              error={errors.first_name?.message}
              {...register('first_name')}
            />
          </>
        ) : (
          <>
            <FormField
              id="new-ro-client-siret"
              label="SIRET *"
              inputMode="numeric"
              placeholder="984 989 137 00018"
              className="num"
              error={errors.siret?.message}
              {...register('siret')}
            />
            <div className="sm:col-span-2">
              <FormField
                id="new-ro-client-contact"
                label="Contact de référence"
                error={errors.contact_name?.message}
                {...register('contact_name')}
              />
            </div>
          </>
        )}
        <FormField
          id="new-ro-client-phone"
          label="Téléphone *"
          type="tel"
          className="num"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <div className="sm:col-span-2">
          <FormField
            id="new-ro-client-email"
            label="E-mail *"
            type="email"
            hint="Utilisé pour l’envoi de la signature, du devis et de la facture"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
        <div className="sm:col-span-3">
          <FormField
            id="new-ro-client-address"
            label={kind === 'individual' ? 'Adresse *' : 'Adresse de facturation *'}
            placeholder="N°, rue, code postal, ville"
            error={errors.billing_address?.message}
            {...register('billing_address')}
          />
        </div>
      </div>
    </div>
  );
}
