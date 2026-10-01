import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pickDirty } from '@/lib/forms';
import { FormField } from '@/components/FormField';
import { updateCompanySettings, type CompanySettings } from './api';
import { useSaveSettings } from './hooks';
import { companyFromForm, companySchema, companyToForm, type CompanyValues } from './schemas';
import { SectionCard } from '@/components/SectionCard';

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
      <div className="grid gap-3.5 sm:grid-cols-3">
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
          id="share_capital"
          label="Capital social"
          placeholder="181 726 €"
          {...register('share_capital')}
        />
      </div>
      <FormField
        id="address_line"
        label="Adresse"
        error={errors.address_line?.message}
        {...register('address_line')}
      />
      <div className="grid gap-3.5 sm:grid-cols-[1fr_2fr_2fr]">
        <FormField
          id="postal_code"
          label="Code postal"
          inputMode="numeric"
          className="num"
          error={errors.postal_code?.message}
          {...register('postal_code')}
        />
        <FormField id="city" label="Ville" error={errors.city?.message} {...register('city')} />
        <FormField
          id="phone"
          label="Téléphone"
          type="tel"
          inputMode="tel"
          className="num"
          {...register('phone')}
        />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <FormField
          id="company_email"
          label="E-mail"
          type="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <FormField id="rcs" label="RCS" placeholder="RCS Pontoise" {...register('rcs')} />
      </div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <FormField
          id="siren"
          label="SIREN"
          inputMode="numeric"
          className="num"
          error={errors.siren?.message}
          {...register('siren')}
        />
        <FormField
          id="siret"
          label="SIRET"
          inputMode="numeric"
          className="num"
          error={errors.siret?.message}
          {...register('siret')}
        />
        <FormField
          id="vat_number"
          label="N° de TVA intracommunautaire"
          className="num"
          error={errors.vat_number?.message}
          {...register('vat_number')}
        />
      </div>
    </SectionCard>
  );
}
