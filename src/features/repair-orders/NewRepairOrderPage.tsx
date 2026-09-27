import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { uploadFile } from '@/features/files/api';
import { createRepairOrder } from './api';
import { formatPlate, STATUS_META, VEHICLE_TYPES } from './constants';
import { useActiveTechnicians, useClientSuggestions, useKnownVehicle, useRepairOrderMutation } from './hooks';
import {
  newRepairOrderDefaults,
  newRepairOrderSchema,
  toNewRepairOrderInput,
  type NewRepairOrderValues,
} from './schemas';
import { SignaturePad } from './SignaturePad';
import { useSignaturePad } from './use-signature-pad';

const UNASSIGNED = 'none';

/** Nouvel ordre de réparation (bureau). */
export function NewRepairOrderPage() {
  const navigate = useNavigate();
  const signature = useSignaturePad();
  const technicians = useActiveTechnicians();
  const [pendingValues, setPendingValues] = useState<NewRepairOrderValues | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getFieldState,
    formState: { errors },
  } = useForm<NewRepairOrderValues>({
    resolver: zodResolver(newRepairOrderSchema),
    defaultValues: newRepairOrderDefaults(),
  });

  const plate = useWatch({ control, name: 'plate' });
  const clientName = useWatch({ control, name: 'client_name' });
  const plannedStart = useWatch({ control, name: 'planned_start' });
  const knownVehicle = useKnownVehicle(plate).data ?? null;
  const clientSuggestions = useClientSuggestions(clientName).data ?? [];

  // Véhicule connu : type et client repris, sauf s'ils ont déjà été saisis.
  useEffect(() => {
    if (!knownVehicle) return;
    if (!getFieldState('vehicle_type').isDirty) setValue('vehicle_type', knownVehicle.vehicle_type);
    if (!getFieldState('client_name').isDirty && knownVehicle.client_name) {
      setValue('client_name', knownVehicle.client_name);
    }
  }, [knownVehicle, getFieldState, setValue]);

  const create = useRepairOrderMutation(
    async (values: NewRepairOrderValues) => {
      const blob = await signature.toBlob();
      const signatureFileId = blob
        ? await uploadFile(blob, { category: 'signature', name: 'signature-client.png' })
        : null;
      return createRepairOrder(toNewRepairOrderInput(values, signatureFileId));
    },
    null, // notification avec le numéro d'OR ci-dessous
  );

  const submit = (values: NewRepairOrderValues) =>
    create.mutate(values, {
      onSuccess: (order) => {
        toast.success(`${order.number} créé pour ${values.plate.toUpperCase()}`);
        void navigate(`/or/${order.id}`);
      },
    });

  // Comme l'ancienne appli : confirmation si un OR non facturé existe déjà pour ce véhicule.
  const onSubmit = handleSubmit((values) => {
    if (knownVehicle?.open_orders.length) setPendingValues(values);
    else submit(values);
  });

  const openOrders = knownVehicle?.open_orders ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Button variant="ghost" asChild className="-ml-3">
        <Link to="/or">
          <ArrowLeft /> Ordres de réparation
        </Link>
      </Button>
      <h1 className="text-3xl font-bold">Nouvel ordre de réparation</h1>

      <Card>
        <CardContent>
          <form id="new-repair-order" onSubmit={onSubmit} noValidate className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="plate"
                render={({ field }) => (
                  <FormField
                    id="plate"
                    label="Immatriculation"
                    placeholder="AB-123-CD"
                    autoComplete="off"
                    className="h-11 text-base font-semibold uppercase"
                    error={errors.plate?.message}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) => field.onChange(formatPlate(event.target.value))}
                  />
                )}
              />
              <div className="space-y-2">
                <FormField
                  id="client_name"
                  label="Client"
                  placeholder="Nom du client / société"
                  autoComplete="off"
                  list="client-suggestions"
                  error={errors.client_name?.message}
                  {...register('client_name')}
                />
                <datalist id="client-suggestions">
                  {clientSuggestions.map((client) => (
                    <option key={client.id} value={client.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {knownVehicle && (
              <Alert variant={openOrders.length ? 'destructive' : 'default'}>
                {openOrders.length ? <AlertTriangle /> : <CheckCircle2 />}
                <AlertDescription>
                  {openOrders.length
                    ? `OR non facturé déjà ouvert pour ce véhicule : ${openOrders
                        .map((o) => `${o.number} (${STATUS_META[o.status].label})`)
                        .join(', ')}.`
                    : `Véhicule connu${knownVehicle.client_name ? ` — ${knownVehicle.client_name}` : ''}.`}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="requested_work">Tâche à faire</Label>
              <Textarea
                id="requested_work"
                rows={3}
                className="text-base"
                placeholder="Description de l’intervention demandée"
                aria-invalid={errors.requested_work ? true : undefined}
                aria-describedby={errors.requested_work ? 'requested_work-error' : undefined}
                {...register('requested_work')}
              />
              {errors.requested_work && (
                <p id="requested_work-error" className="text-sm text-destructive">
                  {errors.requested_work.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="vehicle_type"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="vehicle_type">Type de véhicule</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="vehicle_type" className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
              <FormField
                id="mileage"
                label="Kilométrage (optionnel)"
                inputMode="numeric"
                error={errors.mileage?.message}
                {...register('mileage')}
              />
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold">Planning (optionnel)</legend>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <FormField
                  id="planned_date"
                  label="Date prévue"
                  type="date"
                  className="h-11"
                  {...register('planned_date')}
                />
                <FormField
                  id="planned_start"
                  label="Heure de début"
                  type="time"
                  className="h-11"
                  error={errors.planned_start?.message}
                  {...register('planned_start')}
                />
                <FormField
                  id="planned_end"
                  label="Fin prévue"
                  type="time"
                  className="h-11"
                  disabled={!plannedStart}
                  error={errors.planned_end?.message}
                  {...register('planned_end')}
                />
              </div>
            </fieldset>

            <Controller
              control={control}
              name="technician_id"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label htmlFor="technician_id">Assigner à</Label>
                  <Select
                    value={field.value || UNASSIGNED}
                    onValueChange={(value) => field.onChange(value === UNASSIGNED ? '' : value)}
                  >
                    <SelectTrigger id="technician_id" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>— Non assigné (à faire plus tard) —</SelectItem>
                      {(technicians.data ?? []).map((technician) => (
                        <SelectItem key={technician.id} value={technician.id}>
                          {technician.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            />

            <div className="space-y-2">
              <Label>Signature client (accord pour intervention)</Label>
              <SignaturePad pad={signature} label="Zone de signature du client" />
            </div>
          </form>
        </CardContent>
      </Card>

      <Button type="submit" form="new-repair-order" size="lg" className="w-full" disabled={create.isPending}>
        {create.isPending ? 'Création…' : 'Créer l’OR'}
      </Button>

      <ConfirmDialog
        open={pendingValues !== null}
        onOpenChange={(open) => !open && setPendingValues(null)}
        title="Créer un autre OR pour ce véhicule ?"
        description={`Un OR non facturé existe déjà (${openOrders.map((o) => o.number).join(', ')}).`}
        confirmLabel="Créer quand même"
        pending={create.isPending}
        onConfirm={() => {
          if (pendingValues) submit(pendingValues);
          setPendingValues(null);
        }}
      />
    </div>
  );
}
