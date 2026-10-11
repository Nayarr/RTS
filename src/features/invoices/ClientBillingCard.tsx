import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { SectionCard } from '@/components/SectionCard';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateClientBilling, type ClientBilling } from './api';
import { useInvoiceMutation } from './hooks';
import { formatSiret, siretField, siretValue } from '@/lib/siret';

const billingSchema = z.object({
  billing_address: z.string().trim().max(300),
  siret: siretField,
  email: z.union([z.literal(''), z.email('Adresse e-mail invalide')]),
});
type BillingValues = z.infer<typeof billingSchema>;

const toForm = (client: ClientBilling): BillingValues => ({
  billing_address: client.billing_address ?? '',
  siret: formatSiret(client.siret),
  email: client.email ?? '',
});

/** Coordonnées de facturation du client (mentions obligatoires), reprises à l'émission. */
export function ClientBillingCard({ clientId, client }: { clientId: string; client: ClientBilling }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<BillingValues>({ resolver: zodResolver(billingSchema), values: toForm(client) });

  const save = useInvoiceMutation(
    (values: BillingValues) =>
      updateClientBilling(clientId, {
        billing_address: values.billing_address || null,
        siret: siretValue(values.siret),
        email: values.email.toLowerCase() || null,
      }),
    'Coordonnées du client enregistrées',
  );

  return (
    <SectionCard
      id="client-billing"
      title={`Client : ${client.name}`}
      description="Adresse et SIRET figurent sur la facture ; ils sont enregistrés sur la fiche du client."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <div className="grid gap-3.5 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="field">
          <Label htmlFor="billing-address">Adresse de facturation</Label>
          <Textarea
            id="billing-address"
            rows={2}
            placeholder="N°, rue, code postal, ville"
            {...register('billing_address')}
          />
        </div>
        <FormField
          id="billing-siret"
          label="SIRET"
          inputMode="numeric"
          placeholder="984 989 137 00018"
          className="num"
          error={errors.siret?.message}
          {...register('siret')}
        />
        <FormField
          id="billing-email"
          label="E-mail"
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />
      </div>
    </SectionCard>
  );
}
