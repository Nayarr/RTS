import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { pickDirty } from '@/lib/forms';
import { FormField } from '@/components/FormField';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateCompanySettings, type CompanySettings } from './api';
import { useSaveSettings } from './hooks';
import { billingFromForm, billingSchema, billingToForm, type BillingValues } from './schemas';
import { SectionCard } from '@/components/SectionCard';

/** TVA par défaut, délais et mentions légales des factures. */
export function BillingForm({ company }: { company: CompanySettings }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<BillingValues>({ resolver: zodResolver(billingSchema), values: billingToForm(company) });

  const save = useSaveSettings(
    (values: BillingValues) => updateCompanySettings(pickDirty(billingFromForm(values), dirtyFields)),
    'Réglages de facturation enregistrés',
  );

  return (
    <SectionCard
      id="billing-form"
      title="Devis et factures"
      description="Valeurs proposées par défaut à la création des devis et factures ; déjà émis, un document ne change plus."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <div className="grid gap-3.5 sm:grid-cols-3">
        <FormField
          id="default_vat_rate"
          label="TVA par défaut (%)"
          type="number"
          step="0.01"
          inputMode="decimal"
          className="num"
          error={errors.default_vat_rate?.message}
          {...register('default_vat_rate', { valueAsNumber: true })}
        />
        <FormField
          id="payment_terms_days"
          label="Délai de paiement (jours)"
          type="number"
          inputMode="numeric"
          className="num"
          error={errors.payment_terms_days?.message}
          {...register('payment_terms_days', { valueAsNumber: true })}
        />
        <FormField
          id="quote_validity_days"
          label="Validité des devis (jours)"
          type="number"
          inputMode="numeric"
          className="num"
          error={errors.quote_validity_days?.message}
          {...register('quote_validity_days', { valueAsNumber: true })}
        />
      </div>
      <FormField
        id="supplies_fee_ht"
        label="Ligne « Fournitures et recyclage » (€ HT)"
        inputMode="decimal"
        className="num sm:max-w-[16rem]"
        placeholder="Aucune"
        hint="Ajoutée à chaque nouveau devis et nouvelle facture, supprimable et modifiable sur le document. Vide : pas de ligne."
        error={errors.supplies_fee_ht?.message}
        {...register('supplies_fee_ht')}
      />
      <div className="field">
        <Label htmlFor="invoice_legal_mentions">Mentions légales des factures (une par ligne)</Label>
        <Textarea
          id="invoice_legal_mentions"
          rows={6}
          aria-invalid={errors.invoice_legal_mentions ? true : undefined}
          {...register('invoice_legal_mentions')}
        />
      </div>
    </SectionCard>
  );
}
