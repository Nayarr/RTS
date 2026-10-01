import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { CircleCheck } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { formatPlate } from '@/features/repair-orders/constants';
import { useClientSuggestions, useKnownVehicle } from '@/features/repair-orders/hooks';
import { createQuote } from './api';
import { useQuoteMutation } from './hooks';
import { cn } from '@/lib/utils';

const VEHICLE_CHOICES = [
  { value: 'pl', label: 'PL', detail: 'Poids lourd' },
  { value: 'vul', label: 'VUL', detail: 'Utilitaire léger' },
  { value: 'remorque', label: 'Remorque', detail: 'Semi / remorque' },
] as const;

const newQuoteSchema = z.object({
  client_name: z.string().trim().min(1, 'Indique le client').max(120),
  plate: z.string().max(20),
  vehicle_type: z.enum(['pl', 'vul', 'remorque']),
});
type NewQuoteValues = z.infer<typeof newQuoteSchema>;

/** Devis sans OR (demande de prix) : client obligatoire, véhicule facultatif. */
export function NewQuotePage() {
  const navigate = useNavigate();
  const {
    control,
    register,
    handleSubmit,
    setValue,
    getFieldState,
    formState: { errors },
  } = useForm<NewQuoteValues>({
    resolver: zodResolver(newQuoteSchema),
    defaultValues: { client_name: '', plate: '', vehicle_type: 'pl' },
  });

  const plate = useWatch({ control, name: 'plate' });
  const clientName = useWatch({ control, name: 'client_name' });
  const knownVehicle = useKnownVehicle(plate).data ?? null;
  const clientSuggestions = useClientSuggestions(clientName).data ?? [];

  useEffect(() => {
    if (!knownVehicle) return;
    if (!getFieldState('vehicle_type').isDirty) setValue('vehicle_type', knownVehicle.vehicle_type);
    if (!getFieldState('client_name').isDirty && knownVehicle.client_name) {
      setValue('client_name', knownVehicle.client_name);
    }
  }, [knownVehicle, getFieldState, setValue]);

  const create = useQuoteMutation(async (values: NewQuoteValues) => {
    const id = await createQuote({
      client_name: values.client_name.trim(),
      plate: values.plate.trim(),
      vehicle_type: values.vehicle_type,
    });
    await navigate(`/devis/${id}`);
  }, 'Devis créé');

  const knownClient = clientSuggestions.some(
    (client) => client.name.toLowerCase() === clientName.trim().toLowerCase(),
  );

  return (
    <>
      <PageHeader
        back={{ to: '/devis', label: 'Retour aux devis' }}
        crumbs={[{ label: 'Facturation' }, { label: 'Devis', to: '/devis' }, { label: 'Nouveau' }]}
        title="Nouveau devis"
      />

      <div className="flex justify-center pt-0 lg:pt-6">
        <form
          id="new-quote"
          noValidate
          className="card w-full max-w-[640px] overflow-hidden"
          onSubmit={handleSubmit((values) => create.mutate(values))}
        >
          <div className="card-h flex-col items-start gap-1 px-6 py-5">
            <h2 className="h2 text-[22px]">Demande de prix</h2>
            <span className="hint">
              Pour un devis sans OR. Les devis liés à un OR se préparent depuis la fiche de l’OR.
            </span>
          </div>
          <div className="card-b col gap-[18px] px-6 py-[22px]">
            <div>
              <FormField
                id="quote-client"
                label="Client"
                placeholder="Nom du client / société"
                autoComplete="off"
                list="quote-client-suggestions"
                className="h-12 text-[15px]"
                error={errors.client_name?.message}
                hint={undefined}
                {...register('client_name')}
              />
              {knownClient && (
                <span className="hint row mt-1.5 gap-1.5 text-success!">
                  <CircleCheck className="i xs" /> Client existant : coordonnées reprises sur le devis
                </span>
              )}
              <datalist id="quote-client-suggestions">
                {clientSuggestions.map((client) => (
                  <option key={client.id} value={client.name} />
                ))}
              </datalist>
            </div>
            <Controller
              control={control}
              name="plate"
              render={({ field }) => (
                <FormField
                  id="quote-plate"
                  label="Immatriculation (facultatif)"
                  placeholder="AB-123-CD"
                  autoComplete="off"
                  className="plate h-12 text-lg uppercase"
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(event) => field.onChange(formatPlate(event.target.value))}
                />
              )}
            />
            <Controller
              control={control}
              name="vehicle_type"
              render={({ field }) => (
                <fieldset className="field">
                  <legend className="lbl mb-1.5">Type de véhicule</legend>
                  <div className="grid gap-2.5 sm:grid-cols-3">
                    {VEHICLE_CHOICES.map((choice) => {
                      const selected = field.value === choice.value;
                      return (
                        <label
                          key={choice.value}
                          className={cn(
                            'card row cursor-pointer gap-2.5 p-3.5',
                            selected &&
                              'border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_15%,transparent)]',
                          )}
                        >
                          <input
                            type="radio"
                            name="vehicle_type"
                            className="sr-only"
                            value={choice.value}
                            checked={selected}
                            onChange={() => field.onChange(choice.value)}
                          />
                          <span className={cn('radio', selected && 'on')} aria-hidden />
                          <span className="col gap-0 text-left">
                            <b>{choice.label}</b>
                            <span className="hint">{choice.detail}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <span className="hint">Le type choisit les forfaits proposés dans l’éditeur.</span>
                </fieldset>
              )}
            />
          </div>
          <div className="modal-f px-6 py-4">
            <Button variant="ghost" asChild>
              <Link to="/devis">Annuler</Link>
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer le devis'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
