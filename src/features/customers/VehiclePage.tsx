import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useParams } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, BookOpen, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '@/components/FormField';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { ImageUploadButton } from '@/features/files/ImageUploadButton';
import { StoredImage } from '@/features/files/StoredImage';
import { AppointmentDialog } from '@/features/planning/AppointmentDialog';
import { formatDate, formatPlate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { cn } from '@/lib/utils';
import { updateVehicle, type VehicleDetail } from './api';
import {
  DEADLINE_LABELS,
  DEADLINE_TONE_CLASS,
  deadlineStatus,
  mileageHistory,
  vehicleFromForm,
  vehicleSchema,
  vehicleToForm,
  type VehicleValues,
} from './domain';
import { useCustomerMutation, useVehicle } from './hooks';
import { buildMaintenanceBookPdf } from './maintenance-book-pdf';

const selectClass = 'h-11 w-full rounded-md border bg-transparent px-3 text-base';

/** Fiche véhicule : identification, carte grise, échéances, kilométrage, carnet d'entretien, historique. */
export function VehiclePage() {
  const { id = '' } = useParams();
  const detail = useVehicle(id);

  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger le véhicule.</p>;
  if (!detail.data) return <p className="text-muted-foreground">Véhicule introuvable.</p>;
  return <VehicleView detail={detail.data} key={detail.data.vehicle.id} />;
}

function VehicleView({ detail }: { detail: VehicleDetail }) {
  const { vehicle, orders, lines } = detail;
  const today = todayIso();
  const [appointment, setAppointment] = useState(false);
  const [book, setBook] = useState<PdfFile | null>(null);
  const [bookPending, setBookPending] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<VehicleValues>({ resolver: zodResolver(vehicleSchema), defaultValues: vehicleToForm(vehicle) });
  const [ctDue, tailgateDue] = useWatch({ control, name: ['ct_due_date', 'tailgate_due_date'] });
  const save = useCustomerMutation(
    (values: VehicleValues) => updateVehicle(vehicle.id, vehicleFromForm(values)),
    'Fiche véhicule enregistrée',
  );
  const saveDocument = useCustomerMutation(
    (fileId: string) => updateVehicle(vehicle.id, { registration_doc_file_id: fileId }),
    'Carte grise enregistrée',
  );
  const { points, perYear } = mileageHistory(orders);

  const openBook = async () => {
    setBookPending(true);
    try {
      const { settings, logo } = await loadPdfContext();
      const { doc, fileName } = await buildMaintenanceBookPdf(detail, settings.company, logo);
      setBook({ blob: doc.output('blob'), fileName });
    } catch {
      toast.error('Carnet d’entretien impossible à générer');
    } finally {
      setBookPending(false);
    }
  };

  const plateField = register('plate');

  return (
    <div className="space-y-5">
      <Link
        to={vehicle.client_id ? `/clients/${vehicle.client_id}` : '/vehicules'}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> {vehicle.client_name ?? 'Véhicules'}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-wide">{vehicle.plate}</h1>
          <p className="text-muted-foreground">
            {VEHICLE_TYPES[vehicle.vehicle_type]}
            {vehicle.client_name ? (
              <>
                {' '}
                — Client :{' '}
                <Link to={`/clients/${vehicle.client_id}`} className="underline">
                  {vehicle.client_name}
                </Link>
              </>
            ) : (
              ' — sans client'
            )}
            {vehicle.last_mileage ? ` — Dernier km : ${vehicle.last_mileage.toLocaleString('fr-FR')} km` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={bookPending || orders.length === 0}
            onClick={() => void openBook()}
          >
            <BookOpen /> Carnet d’entretien (PDF)
          </Button>
          <Button variant="outline" onClick={() => setAppointment(true)}>
            <CalendarClock /> Prendre rendez-vous
          </Button>
        </div>
      </div>

      <form
        noValidate
        className="space-y-5"
        onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: () => reset(values) }))}
      >
        <Card>
          <CardHeader>
            <CardTitle>Identification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                id="vehicle-plate"
                label="Immatriculation"
                className="h-11 uppercase"
                error={errors.plate?.message}
                {...plateField}
                onChange={(event) =>
                  setValue('plate', formatPlate(event.target.value), { shouldDirty: true })
                }
              />
              <div className="space-y-2">
                <Label htmlFor="vehicle-type">Type</Label>
                <select id="vehicle-type" className={selectClass} {...register('vehicle_type')}>
                  {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <FormField
                id="vehicle-first-registration"
                label="Mise en circulation"
                type="date"
                {...register('first_registration_date')}
              />
              <FormField id="vehicle-brand" label="Marque" {...register('brand')} />
              <FormField id="vehicle-model" label="Modèle" {...register('model')} />
              <FormField
                id="vehicle-vin"
                label="N° de série (VIN)"
                className="h-11 uppercase"
                {...register('vin')}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Carte grise</p>
              {vehicle.registration_doc_file_id && (
                <StoredImage
                  fileId={vehicle.registration_doc_file_id}
                  alt={`Carte grise ${vehicle.plate}`}
                  className="max-h-56 rounded-md border"
                />
              )}
              <ImageUploadButton
                category="registration_doc"
                onUploaded={(fileId) => saveDocument.mutate(fileId)}
              >
                {vehicle.registration_doc_file_id ? 'Remplacer la carte grise' : 'Ajouter la carte grise'}
              </ImageUploadButton>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Échéances du véhicule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(
              [
                ['ct', 'ct_due_date', ctDue],
                ['tailgate', 'tailgate_due_date', tailgateDue],
              ] as const
            ).map(([kind, field, value]) => {
              const status = deadlineStatus(value, today);
              return (
                <div key={kind} className="flex flex-wrap items-end gap-3">
                  <div className="w-48">
                    <FormField
                      id={`vehicle-${kind}`}
                      label={DEADLINE_LABELS[kind]}
                      type="date"
                      {...register(field)}
                    />
                  </div>
                  <span
                    className={cn('pb-3 text-sm font-semibold', status && DEADLINE_TONE_CLASS[status.tone])}
                  >
                    {status?.label ?? '—'}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-2">
          <Label htmlFor="vehicle-notes">Notes</Label>
          <Textarea id="vehicle-notes" rows={2} {...register('notes')} />
        </div>
        <Button type="submit" disabled={!isDirty || save.isPending}>
          Enregistrer
        </Button>
      </form>

      {points.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Kilométrage</CardTitle>
          </CardHeader>
          <CardContent>
            <MileageChart points={points} />
            {perYear !== null && (
              <p className="text-sm text-muted-foreground">≈ {perYear.toLocaleString('fr-FR')} km / an</p>
            )}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="vehicle-history" className="space-y-2">
        <h2 id="vehicle-history" className="text-lg font-bold">
          Historique ({orders.length} passage{orders.length > 1 ? 's' : ''})
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun passage à l’atelier.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => {
              const work = lines
                .filter((line) => line.repair_order_id === order.id && line.line_type !== 'text')
                .map((line) => line.description.split('\n')[0])
                .join(' • ');
              return (
                <li key={order.id}>
                  <Link to={`/or/${order.id}`} className="block rounded-lg border bg-card p-3 hover:bg-muted">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <strong>
                        {order.number} — {formatDate(order.created_at)}
                      </strong>
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {order.mileage ? `${order.mileage.toLocaleString('fr-FR')} km` : ''}
                        <StatusBadge status={order.status} />
                      </span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {work || order.requested_work}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {appointment && (
        <AppointmentDialog
          appointment={null}
          preset={{
            plate: vehicle.plate,
            client_name: vehicle.client_name ?? '',
            vehicle_type: vehicle.vehicle_type,
          }}
          onClose={() => setAppointment(false)}
        />
      )}
      {book && <PdfPreviewDialog file={book} onClose={() => setBook(null)} />}
    </div>
  );
}

/** Courbe des kilométrages relevés aux passages. */
function MileageChart({ points }: { points: { date: string; mileage: number }[] }) {
  const width = 600;
  const height = 140;
  const times = points.map((point) => Date.parse(point.date));
  const kms = points.map((point) => point.mileage);
  const [minT, maxT] = [Math.min(...times), Math.max(...times)];
  const [minK, maxK] = [Math.min(...kms), Math.max(...kms)];
  const x = (t: number) => 40 + (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * (width - 60));
  const y = (k: number) => height - 20 - (maxK === minK ? 0 : ((k - minK) / (maxK - minK)) * (height - 40));
  const coords = points.map((point) => [x(Date.parse(point.date)), y(point.mileage)] as const);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full max-w-2xl text-primary"
      role="img"
      aria-label={`Kilométrage : de ${minK.toLocaleString('fr-FR')} à ${maxK.toLocaleString('fr-FR')} km`}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        points={coords.map((c) => c.join(',')).join(' ')}
      />
      {coords.map(([cx, cy], index) => (
        <circle key={index} cx={cx} cy={cy} r="3.5" fill="currentColor" />
      ))}
      <text x="40" y="14" fontSize="11" fill="currentColor" className="text-muted-foreground">
        {maxK.toLocaleString('fr-FR')} km
      </text>
      <text x="40" y={height - 4} fontSize="11" fill="currentColor" className="text-muted-foreground">
        {minK.toLocaleString('fr-FR')} km
      </text>
    </svg>
  );
}
