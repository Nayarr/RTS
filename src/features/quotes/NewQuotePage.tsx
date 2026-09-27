import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { formatPlate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { useClientSuggestions, useKnownVehicle } from '@/features/repair-orders/hooks';
import { createQuote } from './api';
import { useQuoteMutation } from './hooks';

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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link to="/devis">
          <ArrowLeft /> Devis
        </Link>
      </Button>
      <h1 className="text-3xl font-bold">Nouveau devis</h1>
      <p className="text-muted-foreground">
        Pour un véhicule déjà à l’atelier, prépare plutôt le devis depuis son OR : les travaux y sont repris.
      </p>

      <Card>
        <CardContent>
          <form
            id="new-quote"
            noValidate
            className="space-y-5"
            onSubmit={handleSubmit((values) => create.mutate(values))}
          >
            <div className="space-y-2">
              <FormField
                id="quote-client"
                label="Client"
                placeholder="Nom du client / société"
                autoComplete="off"
                list="quote-client-suggestions"
                error={errors.client_name?.message}
                {...register('client_name')}
              />
              <datalist id="quote-client-suggestions">
                {clientSuggestions.map((client) => (
                  <option key={client.id} value={client.name} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="plate"
                render={({ field }) => (
                  <FormField
                    id="quote-plate"
                    label="Immatriculation (facultatif)"
                    placeholder="AB-123-CD"
                    autoComplete="off"
                    className="h-11 text-base font-semibold uppercase"
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
                  <div className="space-y-2">
                    <Label htmlFor="quote-vehicle-type">Type de véhicule</Label>
                    <select
                      id="quote-vehicle-type"
                      className="h-11 w-full rounded-md border bg-transparent px-3 text-base"
                      value={field.value}
                      onChange={field.onChange}
                    >
                      {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer le devis'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
