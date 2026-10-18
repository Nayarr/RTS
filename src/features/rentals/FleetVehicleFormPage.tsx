import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploadButton } from '@/features/files/ImageUploadButton';
import { cn } from '@/lib/utils';
import { readRegistration, saveFleetVehicle, type RegistrationReading } from './fleet-api';
import { CATEGORIES, CATEGORY_META, hasEngine, LICENSE_CATEGORIES } from './fleet-domain';
import { useFleetMutation, useFleetVehicle } from './fleet-hooks';
import {
  emptyFleetVehicle,
  FUEL_TYPES,
  fleetVehicleFromForm,
  fleetVehicleSchema,
  fleetVehicleToForm,
  type FleetVehicleOutput,
  type FleetVehicleValues,
} from './fleet-schemas';
import { VehicleVisual } from './ui';
import { READING_FAILED, readingFailedMessage } from '@/lib/reading';

/** Ajout d'un véhicule à la flotte, ou modification (identification, tarifs, échéances). */
export function FleetVehicleFormPage() {
  const { id = '' } = useParams();
  const vehicle = useFleetVehicle(id);
  if (id && vehicle.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (id && !vehicle.data) return <p className="text-destructive">Véhicule introuvable.</p>;
  return (
    <FleetVehicleForm
      id={id || null}
      initial={vehicle.data ? fleetVehicleToForm(vehicle.data) : emptyFleetVehicle()}
    />
  );
}

function FleetVehicleForm({ id, initial }: { id: string | null; initial: FleetVehicleValues }) {
  const navigate = useNavigate();
  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FleetVehicleValues, unknown, FleetVehicleOutput>({
    resolver: zodResolver(fleetVehicleSchema),
    defaultValues: initial,
  });
  const category = useWatch({ control, name: 'category' });
  const photo = useWatch({ control, name: 'photo_file_id' });
  const engine = hasEngine(category);
  const [reading, setReading] = useState<'idle' | 'reading' | RegistrationReading>('idle');

  // Carte grise lue : les champs lus remplacent la saisie, à vérifier avant d'enregistrer
  const readCard = async (fileId: string) => {
    setReading('reading');
    try {
      const read = await readRegistration(fileId);
      const fill = (
        name: 'plate' | 'brand' | 'model' | 'vin' | 'first_registration',
        value: string | null,
      ) => {
        if (value) setValue(name, value, { shouldDirty: true, shouldValidate: true });
      };
      fill('plate', read.plate);
      fill('brand', read.brand);
      fill('model', read.model);
      fill('vin', read.vin);
      fill('first_registration', read.first_registration);
      if (read.category) setValue('category', read.category, { shouldDirty: true });
      if (read.fuel_type) setValue('fuel_type', read.fuel_type, { shouldDirty: true });
      // Rien de lu sur la photo : saisie à la main
      if (![read.plate, read.brand, read.model, read.vin, read.first_registration].some(Boolean)) {
        setReading('idle');
        toast.error(READING_FAILED);
        return;
      }
      setReading(read);
    } catch (error) {
      setReading('idle');
      toast.error(readingFailedMessage(error));
    }
  };
  const save = useFleetMutation(
    (values: FleetVehicleOutput) => saveFleetVehicle(id, fleetVehicleFromForm(values)),
    id ? 'Véhicule enregistré' : 'Véhicule ajouté à la flotte',
  );
  const back = id ? `/location/flotte/${id}` : '/location/flotte';
  const submit = handleSubmit((values) =>
    save.mutate(values, { onSuccess: (savedId) => void navigate(`/location/flotte/${savedId}`) }),
  );

  return (
    <form id="fleet-vehicle-form" noValidate onSubmit={submit}>
      <PageHeader
        crumbs={[
          { label: 'Location' },
          { label: 'Flotte', to: '/location/flotte' },
          { label: id ? initial.plate : 'Nouveau véhicule' },
        ]}
        title={id ? `Modifier ${initial.plate}` : 'Ajouter un véhicule à la flotte'}
        back={{ to: back, label: 'Retour' }}
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void navigate(back)}>
              Annuler
            </Button>
            <Button type="submit" form="fleet-vehicle-form" disabled={save.isPending}>
              <Check /> Enregistrer
            </Button>
          </>
        }
      />

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_380px]!">
        <div className="col gap-4">
          <section data-slot="card" className="card" aria-labelledby="fleet-type">
            <div className="card-h">
              <h2 className="h2" id="fleet-type">
                Type de véhicule
              </h2>
            </div>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <div
                  className="card-b grid grid-cols-2 gap-2.5 md:grid-cols-4"
                  role="radiogroup"
                  aria-label="Type de véhicule"
                >
                  {CATEGORIES.map((value) => {
                    const meta = CATEGORY_META[value];
                    const on = field.value === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={cn(
                          'card col cursor-pointer items-start gap-2 p-3.5 text-left',
                          on && 'border-primary bg-accent',
                        )}
                        onClick={() => {
                          field.onChange(value);
                          if (value === 'tractor') setValue('license_category', 'CE');
                        }}
                      >
                        <meta.icon
                          className={cn('i l', on ? 'text-accent-foreground' : 'text-muted-foreground')}
                        />
                        <span className="c2">
                          <b>{meta.label}</b>
                          <span>{meta.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            />
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-identity">
            <div className="card-h">
              <h2 className="h2" id="fleet-identity">
                Identification
              </h2>
            </div>
            <div className="card-b col gap-3.5">
              <div className="grid gap-3.5 sm:grid-cols-3">
                <FormField
                  id="plate"
                  label="Immatriculation *"
                  autoComplete="off"
                  error={errors.plate?.message}
                  {...register('plate')}
                />
                <FormField id="brand" label="Marque *" error={errors.brand?.message} {...register('brand')} />
                <FormField id="model" label="Modèle *" error={errors.model?.message} {...register('model')} />
                <FormField
                  id="vin"
                  label="N° de série (VIN)"
                  className="uppercase"
                  error={errors.vin?.message}
                  {...register('vin')}
                />
                <FormField
                  id="first_registration"
                  label="Mise en circulation"
                  type="date"
                  {...register('first_registration')}
                />
                {engine && (
                  <FormField
                    id="mileage"
                    label="Kilométrage actuel"
                    inputMode="numeric"
                    error={errors.mileage?.message}
                    {...register('mileage')}
                  />
                )}
              </div>
              <div className="grid gap-3.5 sm:grid-cols-3">
                {engine && (
                  <div className="field">
                    <Label htmlFor="fuel_type">Carburant</Label>
                    <select id="fuel_type" className="inp" {...register('fuel_type')}>
                      {FUEL_TYPES.map((fuel) => (
                        <option key={fuel}>{fuel}</option>
                      ))}
                    </select>
                  </div>
                )}
                {engine && (
                  <FormField
                    id="tank_liters"
                    label="Capacité du réservoir (L)"
                    inputMode="numeric"
                    error={errors.tank_liters?.message}
                    {...register('tank_liters')}
                  />
                )}
                <div className="field">
                  <Label htmlFor="license_category">Permis requis</Label>
                  <select id="license_category" className="inp" {...register('license_category')}>
                    {LICENSE_CATEGORIES.map((license) => (
                      <option key={license}>{license}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Controller
                control={control}
                name="loanable"
                render={({ field }) => (
                  <div className="row gap-2.5">
                    <Switch id="loanable" checked={field.value} onCheckedChange={field.onChange} />
                    <Label htmlFor="loanable">Disponible aussi comme véhicule de prêt pendant un OR</Label>
                  </div>
                )}
              />
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-rates">
            <div className="card-h">
              <h2 className="h2" id="fleet-rates">
                Tarifs de location (HT)
              </h2>
            </div>
            <div className="card-b col gap-3.5">
              <div className="grid gap-3.5 sm:grid-cols-4">
                <FormField
                  id="daily_rate"
                  label="Prix par jour (€) *"
                  inputMode="decimal"
                  error={errors.daily_rate?.message}
                  {...register('daily_rate')}
                />
                {engine && (
                  <FormField
                    id="km_included_per_day"
                    label="Km inclus / jour"
                    inputMode="numeric"
                    error={errors.km_included_per_day?.message}
                    {...register('km_included_per_day')}
                  />
                )}
                {engine && (
                  <FormField
                    id="extra_km_price"
                    label="Km supplémentaire (€)"
                    inputMode="decimal"
                    error={errors.extra_km_price?.message}
                    {...register('extra_km_price')}
                  />
                )}
                <FormField
                  id="deposit"
                  label="Caution (€) *"
                  inputMode="decimal"
                  error={errors.deposit?.message}
                  {...register('deposit')}
                />
              </div>
              <div className="grid gap-3.5 sm:grid-cols-4">
                <FormField
                  id="weekend_rate"
                  label="Week-end (€)"
                  placeholder="facultatif"
                  inputMode="decimal"
                  error={errors.weekend_rate?.message}
                  {...register('weekend_rate')}
                />
                <FormField
                  id="week_rate"
                  label="Semaine (€)"
                  placeholder="facultatif"
                  inputMode="decimal"
                  error={errors.week_rate?.message}
                  {...register('week_rate')}
                />
                <FormField
                  id="month_rate"
                  label="Mois (€)"
                  placeholder="facultatif"
                  inputMode="decimal"
                  error={errors.month_rate?.message}
                  {...register('month_rate')}
                />
                <FormField
                  id="year_rate"
                  label="Année (€)"
                  placeholder="facultatif"
                  inputMode="decimal"
                  error={errors.year_rate?.message}
                  {...register('year_rate')}
                />
                <FormField
                  id="franchise"
                  label="Franchise (€)"
                  inputMode="decimal"
                  error={errors.franchise?.message}
                  {...register('franchise')}
                />
              </div>
              <div className="grid gap-3.5 sm:grid-cols-3">
                {engine && (
                  <FormField
                    id="fuel_price_per_liter"
                    label="Carburant manquant (€ / L)"
                    inputMode="decimal"
                    error={errors.fuel_price_per_liter?.message}
                    {...register('fuel_price_per_liter')}
                  />
                )}
                <FormField
                  id="cleaning_fee"
                  label="Forfait nettoyage (€)"
                  inputMode="decimal"
                  error={errors.cleaning_fee?.message}
                  {...register('cleaning_fee')}
                />
                <FormField
                  id="late_fee_per_hour"
                  label="Retard (€ / h)"
                  inputMode="decimal"
                  error={errors.late_fee_per_hour?.message}
                  {...register('late_fee_per_hour')}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="col gap-4">
          <section data-slot="card" className="card" aria-labelledby="fleet-registration">
            <div className="card-h">
              <h2 className="h2" id="fleet-registration">
                Carte grise
              </h2>
            </div>
            <div className="card-b col gap-2.5">
              <p className="hint">
                Photographie la carte grise : immatriculation, marque, modèle, VIN, première immatriculation,
                catégorie et carburant sont remplis, à vérifier avant d’enregistrer.
              </p>
              <ImageUploadButton
                category="registration_doc"
                size="sm"
                onUploaded={(fileId) => void readCard(fileId)}
              >
                <ScanLine /> {reading === 'reading' ? 'Lecture…' : 'Lire la carte grise'}
              </ImageUploadButton>
              {typeof reading === 'object' && (
                <p className={cn('alert', reading.confidence === 'faible' ? 's-warn' : 's-ok')} role="status">
                  {reading.confidence === 'faible'
                    ? 'Carte grise lue avec doute : vérifie chaque champ.'
                    : 'Carte grise lue : vérifie les champs remplis avant d’enregistrer.'}
                </p>
              )}
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-photo">
            <div className="card-h">
              <h2 className="h2" id="fleet-photo">
                Photo du véhicule
              </h2>
            </div>
            <div className="card-b col gap-2.5">
              <VehicleVisual
                category={category}
                fileId={photo}
                alt="Photo du véhicule"
                className="h-[170px] w-full rounded-lg border"
              />
              <ImageUploadButton
                category="other"
                size="sm"
                onUploaded={(fileId) => setValue('photo_file_id', fileId, { shouldDirty: true })}
              >
                {photo ? 'Changer' : 'Ajouter une photo'}
              </ImageUploadButton>
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-deadlines">
            <div className="card-h">
              <h2 className="h2" id="fleet-deadlines">
                Échéances
              </h2>
            </div>
            <div className="card-b col gap-3">
              <div className="grid grid-cols-2 gap-2.5">
                <FormField
                  id="ct_due_date"
                  label="Contrôle technique"
                  type="date"
                  {...register('ct_due_date')}
                />
                <FormField
                  id="insurance_due_date"
                  label="Fin d’assurance"
                  type="date"
                  {...register('insurance_due_date')}
                />
              </div>
              {engine && (
                <FormField
                  id="next_service_km"
                  label="Prochaine vidange (km)"
                  inputMode="numeric"
                  error={errors.next_service_km?.message}
                  {...register('next_service_km')}
                />
              )}
              <span className="hint">
                Assurance ou contrôle technique expiré : le véhicule ne peut plus être loué ni prêté.
              </span>
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="fleet-notes">
            <div className="card-h">
              <h2 className="h2" id="fleet-notes">
                Notes
              </h2>
            </div>
            <div className="card-b col gap-2">
              <Textarea aria-labelledby="fleet-notes" rows={3} {...register('notes')} />
              {!id && (
                <span className="hint">
                  Les documents de la boîte à gants s’ajoutent une fois le véhicule enregistré.
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </form>
  );
}
