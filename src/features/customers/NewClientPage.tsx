import { useCallback } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveLicense, type LicenseReading } from '@/features/rentals/license-api';
import {
  emptyLicense,
  licenseFromForm,
  licenseSchema,
  properName,
  type LicenseOutput,
  type LicenseValues,
} from '@/features/rentals/license-domain';
import { LicenseEditor } from '@/features/rentals/LicenseEditor';
import { cn } from '@/lib/utils';
import { createClient } from './api';
import { emptyNewClient, newClientFromForm, newClientSchema, type NewClientValues } from './domain';

/** Le permis n'est enregistré que s'il a été scanné ou saisi. */
const licenseStarted = (values: LicenseValues) =>
  Boolean(values.recto_file_id || values.verso_file_id || values.license_number.trim());

/**
 * Nouveau client : professionnel (raison sociale, SIREN) ou particulier (identité et permis
 * de conduire scanné, qui remplit l'identité automatiquement).
 */
export function NewClientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<NewClientValues>({
    resolver: zodResolver(newClientSchema),
    defaultValues: emptyNewClient('individual'),
  });
  const licenseForm = useForm<LicenseValues, unknown, LicenseOutput>({
    resolver: zodResolver(licenseSchema),
    defaultValues: emptyLicense(),
  });
  const {
    control,
    register,
    getValues,
    setValue,
    formState: { errors },
  } = form;
  const kind = useWatch({ control, name: 'kind' });

  // Identité du client remplie depuis le permis lu (seulement les champs encore vides)
  const fillIdentity = useCallback(
    (reading: LicenseReading) => {
      const fill = (
        name: 'last_name' | 'first_name' | 'birth_date' | 'birth_place',
        value: string | null,
      ) => {
        if (value && !getValues(name).trim()) setValue(name, value, { shouldDirty: true });
      };
      fill('last_name', reading.last_name && properName(reading.last_name));
      fill('first_name', reading.first_name && properName(reading.first_name));
      fill('birth_date', reading.birth_date);
      fill('birth_place', reading.birth_place);
    },
    [getValues, setValue],
  );

  const save = useMutation({
    mutationFn: async ({ client, license }: { client: NewClientValues; license: LicenseOutput | null }) => {
      const id = await createClient(newClientFromForm(client));
      if (license) await saveLicense(null, licenseFromForm(license, id));
      return id;
    },
    onSuccess: async (id) => {
      toast.success('Client créé');
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      void navigate(`/clients/${id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Enregistrement impossible'),
  });

  const submit = form.handleSubmit(async (client) => {
    if (client.kind === 'individual' && licenseStarted(licenseForm.getValues())) {
      // Titulaire du permis : le client lui-même
      licenseForm.setValue('last_name', client.last_name);
      licenseForm.setValue('first_name', client.first_name);
      licenseForm.setValue('birth_date', client.birth_date);
      licenseForm.setValue('birth_place', client.birth_place);
      await licenseForm.handleSubmit((license) => save.mutate({ client, license }))();
      return;
    }
    save.mutate({ client, license: null });
  });

  return (
    <form id="new-client-form" noValidate onSubmit={(event) => void submit(event)}>
      <PageHeader
        crumbs={[{ label: 'Clients', to: '/clients' }, { label: 'Nouveau client' }]}
        title="Nouveau client"
        back={{ to: '/clients', label: 'Retour aux clients' }}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void navigate('/clients')}>
              Annuler
            </Button>
            <Button type="submit" form="new-client-form" disabled={save.isPending}>
              <Check /> Enregistrer
            </Button>
          </>
        }
      />

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_420px]!">
        <div className="col gap-4">
          <section data-slot="card" className="card" aria-labelledby="client-kind">
            <div className="card-h">
              <h2 className="h2" id="client-kind">
                Type de client
              </h2>
            </div>
            <Controller
              control={control}
              name="kind"
              render={({ field }) => (
                <div
                  className="card-b grid gap-3 sm:grid-cols-2"
                  role="radiogroup"
                  aria-labelledby="client-kind"
                >
                  {(
                    [
                      ['pro', 'Professionnel', 'Raison sociale, SIREN, adresse de facturation', Building2],
                      ['individual', 'Particulier', 'Identité, permis de conduire, coordonnées', User],
                    ] as const
                  ).map(([value, label, hint, Icon]) => {
                    const on = field.value === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={cn(
                          'card row cursor-pointer items-center gap-3 p-3.5 text-left',
                          on && 'border-primary bg-accent',
                        )}
                        onClick={() => field.onChange(value)}
                      >
                        <span className="c2 grow">
                          <b>{label}</b>
                          <span>{hint}</span>
                        </span>
                        <Icon className={cn('i', on ? 'text-accent-foreground' : 'text-muted-foreground')} />
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </section>

          <section data-slot="card" className="card" aria-labelledby="client-identity">
            <div className="card-h">
              <h2 className="h2" id="client-identity">
                {kind === 'individual' ? 'Identité' : 'Entreprise'}
              </h2>
            </div>
            <div className="card-b grid gap-3.5 sm:grid-cols-3">
              {kind === 'individual' ? (
                <>
                  <div className="field">
                    <Label htmlFor="new-client-civility">Civilité</Label>
                    <select id="new-client-civility" className="inp" {...register('civility')}>
                      <option value="">-</option>
                      <option value="Mme">Mme</option>
                      <option value="M.">M.</option>
                    </select>
                  </div>
                  <FormField
                    id="new-client-last-name"
                    label="Nom *"
                    error={errors.last_name?.message}
                    {...register('last_name')}
                  />
                  <FormField
                    id="new-client-first-name"
                    label="Prénom *"
                    error={errors.first_name?.message}
                    {...register('first_name')}
                  />
                  <FormField
                    id="new-client-birth-date"
                    label="Date de naissance"
                    type="date"
                    hint="Requise pour louer"
                    error={errors.birth_date?.message}
                    {...register('birth_date')}
                  />
                  <FormField
                    id="new-client-birth-place"
                    label="Lieu de naissance"
                    error={errors.birth_place?.message}
                    {...register('birth_place')}
                  />
                </>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <FormField
                      id="new-client-name"
                      label="Raison sociale *"
                      error={errors.name?.message}
                      {...register('name')}
                    />
                  </div>
                  <FormField
                    id="new-client-siren"
                    label="SIREN"
                    inputMode="numeric"
                    className="num"
                    error={errors.siren?.message}
                    {...register('siren')}
                  />
                  <div className="sm:col-span-2">
                    <FormField
                      id="new-client-contact"
                      label="Contact de référence"
                      error={errors.contact_name?.message}
                      {...register('contact_name')}
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="client-contact">
            <div className="card-h">
              <h2 className="h2" id="client-contact">
                Coordonnées
              </h2>
            </div>
            <div className="card-b grid gap-3.5 sm:grid-cols-2">
              <FormField
                id="new-client-phone"
                label={kind === 'individual' ? 'Téléphone mobile' : 'Téléphone du contact'}
                type="tel"
                className="num"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <FormField
                id="new-client-email"
                label="E-mail"
                type="email"
                hint="Pour recevoir le contrat et la facture"
                error={errors.email?.message}
                {...register('email')}
              />
              <div className="sm:col-span-2">
                <FormField
                  id="new-client-address"
                  label={kind === 'individual' ? 'Adresse' : 'Adresse de facturation'}
                  placeholder="N°, rue, code postal, ville"
                  {...register('billing_address')}
                />
              </div>
              <div className="field sm:col-span-2">
                <Label htmlFor="new-client-notes">Notes</Label>
                <Textarea id="new-client-notes" rows={3} {...register('notes')} />
              </div>
            </div>
          </section>
        </div>

        {kind === 'individual' && (
          <div className="col gap-4">
            <section data-slot="card" className="card" aria-labelledby="client-license">
              <div className="card-h">
                <h2 className="h2" id="client-license">
                  Permis de conduire
                </h2>
              </div>
              <div className="card-b">
                <LicenseEditor
                  form={licenseForm}
                  idPrefix="new-license"
                  withIdentity={false}
                  onRead={fillIdentity}
                />
              </div>
            </section>
            <section data-slot="card" className="card" aria-labelledby="client-privacy">
              <div className="card-h">
                <h2 className="h2" id="client-privacy">
                  <ShieldCheck className="i s text-muted-foreground" /> Données personnelles
                </h2>
              </div>
              <p className="card-b hint">
                Le permis sert uniquement aux locations. Il est consultable par le bureau seulement, et peut
                être retiré de la fiche à tout moment.
              </p>
            </section>
          </div>
        )}
      </div>
    </form>
  );
}
