import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FormField } from '@/components/FormField';
import { updateCompanySettings, type CompanySettings } from './api';
import { useSaveSettings } from './hooks';
import { companyFromForm, companySchema, companyToForm, pickDirty, type CompanyValues } from './schemas';
import { SectionCard } from './SectionCard';

/** Coordonnées légales imprimées sur les devis et factures. */
export function CompanyForm({ company }: { company: CompanySettings }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<CompanyValues>({ resolver: zodResolver(companySchema), values: companyToForm(company) });

  const save = useSaveSettings(
    (values: CompanyValues) => updateCompanySettings(pickDirty(companyFromForm(values), dirtyFields)),
    'Coordonnées enregistrées',
  );

  return (
    <SectionCard
      id="company-form"
      title="Coordonnées de l’entreprise"
      description="En-tête et pied de page des devis, factures et avoirs."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="legal_name"
          label="Raison sociale"
          error={errors.legal_name?.message}
          {...register('legal_name')}
        />
        <FormField
          id="legal_form"
          label="Forme juridique"
          placeholder="SASU, SARL…"
          {...register('legal_form')}
        />
        <FormField
          id="address_line"
          label="Adresse"
          error={errors.address_line?.message}
          {...register('address_line')}
        />
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <FormField
            id="postal_code"
            label="Code postal"
            inputMode="numeric"
            error={errors.postal_code?.message}
            {...register('postal_code')}
          />
          <FormField id="city" label="Ville" error={errors.city?.message} {...register('city')} />
        </div>
        <FormField
          id="company_email"
          label="E-mail"
          type="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField id="phone" label="Téléphone" type="tel" inputMode="tel" {...register('phone')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="siren"
          label="SIREN"
          inputMode="numeric"
          error={errors.siren?.message}
          {...register('siren')}
        />
        <FormField
          id="siret"
          label="SIRET"
          inputMode="numeric"
          error={errors.siret?.message}
          {...register('siret')}
        />
        <FormField
          id="vat_number"
          label="N° de TVA intracommunautaire"
          error={errors.vat_number?.message}
          {...register('vat_number')}
        />
        <FormField id="rcs" label="RCS" placeholder="RCS Pontoise" {...register('rcs')} />
        <FormField
          id="share_capital"
          label="Capital social"
          placeholder="181 726 €"
          {...register('share_capital')}
        />
      </div>
    </SectionCard>
  );
}
