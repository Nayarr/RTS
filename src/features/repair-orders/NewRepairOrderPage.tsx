import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Info,
  PenLine,
  Truck,
} from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { uploadFile } from '@/features/files/api';
import { createRepairOrder } from './api';
import { formatPlate, STATUS_META, VEHICLE_TYPES } from './constants';
import { useActiveTechnicians, useClientSuggestions, useKnownVehicle, useRepairOrderMutation } from './hooks';
import { InspectionRequiredToggle } from './InspectionRequiredToggle';
import {
  newRepairOrderDefaults,
  newRepairOrderSchema,
  toNewRepairOrderInput,
  type NewRepairOrderValues,
} from './schemas';
import { SignaturePad } from '@/components/SignaturePad';
import { useSignaturePad } from '@/components/use-signature-pad';
import { cn } from '@/lib/utils';

const UNASSIGNED = 'none';

/** Où le client signe : sur cet écran, sur la borne (client sur place) ou par lien e-mail (client absent). */
type SignatureMode = 'screen' | 'borne' | 'email';
const SIGNATURE_MODES: { value: SignatureMode; label: string; hint: string }[] = [
  {
    value: 'screen',
    label: 'Sur cet écran',
    hint: 'Accord du client pour l’intervention, signé sur l’écran.',
  },
  {
    value: 'borne',
    label: 'Sur la borne',
    hint: 'Client sur place : la demande s’affiche sur la borne pendant 1 minute, dès la création de l’OR.',
  },
  {
    value: 'email',
    label: 'Par e-mail',
    hint: 'Client absent : un lien de signature (valable 7 jours) est prêt à envoyer dès la création de l’OR.',
  },
];

/** Nouvel ordre de réparation (bureau). */
export function NewRepairOrderPage() {
  const navigate = useNavigate();
  const signature = useSignaturePad();
  const [signatureMode, setSignatureMode] = useState<SignatureMode>('screen');
  const [inspectionRequired, setInspectionRequired] = useState(false);
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
      const blob = signatureMode === 'screen' ? await signature.toBlob() : null;
      const signatureFileId = blob
        ? await uploadFile(blob, { category: 'signature', name: 'signature-client.png' })
        : null;
      return createRepairOrder({
        ...toNewRepairOrderInput(values, signatureFileId),
        inspection_required: inspectionRequired,
      });
    },
    null, // notification avec le numéro d'OR ci-dessous
  );

  const submit = (values: NewRepairOrderValues) =>
    create.mutate(values, {
      onSuccess: (order) => {
        toast.success(`${order.number} créé pour ${values.plate.toUpperCase()}`);
        // Borne / e-mail : la fiche OR lance la demande de signature dès son ouverture.
        void navigate(
          signatureMode === 'screen' ? `/or/${order.id}` : `/or/${order.id}?signature=${signatureMode}`,
        );
      },
    });

  // Comme l'ancienne appli : confirmation si un OR non facturé existe déjà pour ce véhicule.
  const onSubmit = handleSubmit((values) => {
    if (knownVehicle?.open_orders.length) setPendingValues(values);
    else submit(values);
  });

  const openOrders = knownVehicle?.open_orders ?? [];

  return (
    <>
      <PageHeader
        back={{ to: '/or', label: 'Retour aux ordres de réparation' }}
        crumbs={[{ label: 'Atelier' }, { label: 'Ordres de réparation', to: '/or' }, { label: 'Nouveau' }]}
        title="Nouvel ordre de réparation"
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link to="/or">Annuler</Link>
            </Button>
            <Button type="submit" form="new-repair-order" disabled={create.isPending}>
              <Check /> {create.isPending ? 'Création…' : 'Créer l’OR'}
            </Button>
          </>
        }
      />

      <form
        id="new-repair-order"
        onSubmit={onSubmit}
        noValidate
        className="split w-full max-w-[1176px] grid-cols-1! lg:grid-cols-[minmax(0,1fr)_400px]!"
      >
        <div className="col gap-5">
          <section data-slot="card" className="card" aria-labelledby="new-ro-vehicle">
            <div className="card-h">
              <h2 className="h2" id="new-ro-vehicle">
                <Truck className="i" /> Véhicule et client
              </h2>
            </div>
            <div className="card-b col gap-4">
              <div className="g2 grid-cols-1! sm:grid-cols-2!">
                <Controller
                  control={control}
                  name="plate"
                  render={({ field }) => (
                    <FormField
                      id="plate"
                      label="Immatriculation"
                      placeholder="AB-123-CD"
                      autoComplete="off"
                      className="plate lg h-12 text-xl uppercase"
                      error={errors.plate?.message}
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
                    <div className="field">
                      <span className="lbl" id="vehicle_type-label">
                        Type de véhicule
                      </span>
                      <div className="seg h-12 self-start" role="group" aria-labelledby="vehicle_type-label">
                        {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            className={cn('h-10! px-[22px]!', field.value === value && 'on')}
                            aria-pressed={field.value === value}
                            onClick={() => field.onChange(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                />
              </div>

              {knownVehicle &&
                (openOrders.length ? (
                  <Alert variant="destructive">
                    <AlertTriangle />
                    <AlertDescription>
                      {`OR non facturé déjà ouvert pour ce véhicule : ${openOrders
                        .map((o) => `${o.number} (${STATUS_META[o.status].label})`)
                        .join(', ')}.`}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <p className="hint row gap-1.5 text-success!">
                    <CheckCircle2 className="i xs" />
                    {`Véhicule connu${knownVehicle.client_name ? ` — ${knownVehicle.client_name}` : ''}.`}
                  </p>
                ))}

              <div className="g2 grid-cols-1! sm:grid-cols-2!">
                <div>
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
                <FormField
                  id="mileage"
                  label="Kilométrage (optionnel)"
                  inputMode="numeric"
                  className="num"
                  error={errors.mileage?.message}
                  {...register('mileage')}
                />
              </div>
            </div>
          </section>

          <section data-slot="card" className="card">
            <div className="card-h">
              <h2 className="h2" id="new-ro-task">
                <ClipboardCheck className="i" /> Tâche à faire
              </h2>
            </div>
            <div className="card-b col gap-4">
              <div className="field">
                <Label htmlFor="requested_work" className="sr-only">
                  Tâche à faire
                </Label>
                <Textarea
                  id="requested_work"
                  rows={4}
                  placeholder="Description de l’intervention demandée"
                  aria-invalid={errors.requested_work ? true : undefined}
                  aria-describedby={errors.requested_work ? 'requested_work-error' : undefined}
                  {...register('requested_work')}
                />
                {errors.requested_work && (
                  <p id="requested_work-error" className="err">
                    {errors.requested_work.message}
                  </p>
                )}
              </div>
              <Controller
                control={control}
                name="technician_id"
                render={({ field }) => (
                  <div className="field">
                    <Label htmlFor="technician_id">Assigner à</Label>
                    <Select
                      value={field.value || UNASSIGNED}
                      onValueChange={(value) => field.onChange(value === UNASSIGNED ? '' : value)}
                    >
                      <SelectTrigger id="technician_id" className="w-full">
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
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="new-ro-planning">
            <div className="card-h">
              <h2 className="h2" id="new-ro-planning">
                <CalendarDays className="i" /> Planning{' '}
                <span className="muted font-sans text-sm font-medium">(optionnel)</span>
              </h2>
            </div>
            <div className="card-b grid grid-cols-2 gap-4 sm:grid-cols-3">
              <FormField id="planned_date" label="Date prévue" type="date" {...register('planned_date')} />
              <FormField
                id="planned_start"
                label="Heure de début"
                type="time"
                error={errors.planned_start?.message}
                {...register('planned_start')}
              />
              <FormField
                id="planned_end"
                label="Fin prévue"
                type="time"
                disabled={!plannedStart}
                error={errors.planned_end?.message}
                {...register('planned_end')}
              />
            </div>
          </section>

          <InspectionRequiredToggle
            id="new-ro-inspection-required"
            checked={inspectionRequired}
            onCheckedChange={setInspectionRequired}
          />
        </div>

        <div className="col gap-5">
          <section data-slot="card" className="card" aria-labelledby="new-ro-signature">
            <div className="card-h">
              <h2 className="h2" id="new-ro-signature">
                <PenLine className="i" /> Signature client
              </h2>
              {signatureMode === 'screen' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={signature.clear}
                  disabled={signature.isEmpty}
                >
                  Effacer
                </Button>
              )}
            </div>
            <div className="card-b col gap-2.5">
              <div className="seg self-start" role="group" aria-label="Où le client signe-t-il ?">
                {SIGNATURE_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    className={cn(signatureMode === mode.value && 'on')}
                    aria-pressed={signatureMode === mode.value}
                    onClick={() => setSignatureMode(mode.value)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              <p className="hint">{SIGNATURE_MODES.find((mode) => mode.value === signatureMode)?.hint}</p>
              {signatureMode === 'screen' && (
                <SignaturePad pad={signature} label="Zone de signature du client" showClear={false} />
              )}
            </div>
          </section>
          <div className="alert s-blue">
            <Info className="i" />
            <div>
              L’atelier voit l’OR immédiatement : il apparaît sur le téléphone du technicien assigné et sur
              l’écran télé.
            </div>
          </div>
        </div>
      </form>

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
    </>
  );
}
