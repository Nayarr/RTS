import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { SectionCard } from '@/components/SectionCard';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateClientBilling, type ClientBilling } from './api';
import { useInvoiceMutation } from './hooks';

const billingSchema = z.object({
  billing_address: z.string().trim().max(300),
  siren: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{9}$/.test(value.replace(/\s/g, '')), 'SIREN à 9 chiffres'),
  email: z.union([z.literal(''), z.email('Adresse e-mail invalide')]),
});
type BillingValues = z.infer<typeof billingSchema>;

const toForm = (client: ClientBilling): BillingValues => ({
  billing_address: client.billing_address ?? '',
  siren: client.siren ?? '',
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
        siren: values.siren.replace(/\s/g, '') || null,
        email: values.email.toLowerCase() || null,
      }),
    'Coordonnées du client enregistrées',
  );

  return (
    <SectionCard
      id="client-billing"
      title={`Client : ${client.name}`}
      description="Adresse et SIREN figurent sur la facture ; ils sont enregistrés sur la fiche du client."
      onSubmit={handleSubmit((values) => save.mutate(values))}
      dirty={isDirty}
      pending={save.isPending}
      onCancel={() => reset()}
    >
      <div className="space-y-2">
        <Label htmlFor="billing-address">Adresse de facturation</Label>
        <Textarea
          id="billing-address"
          rows={3}
          className="text-base"
          placeholder="N°, rue, code postal, ville"
          {...register('billing_address')}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="billing-siren"
          label="SIREN"
          inputMode="numeric"
          placeholder="123 456 789"
          error={errors.siren?.message}
          {...register('siren')}
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
