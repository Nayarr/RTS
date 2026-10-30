import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRightLeft, CalendarDays, Download, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MonthYearField } from '@/components/MonthYearField';
import { FormField } from '@/components/FormField';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loadPdfContext } from '@/features/documents/pdf-context';
import { ImageUploadButton } from '@/features/files/ImageUploadButton';
import { StoredImage } from '@/features/files/StoredImage';
import { AppointmentDialog } from '@/features/planning/AppointmentDialog';
import { formatDate, formatPlate, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { StatusBadge } from '@/features/repair-orders/StatusBadge';
import { taskSummary } from '@/features/repair-orders/tasks';
import { useProfile } from '@/features/auth/useProfile';
import { deleteVehicle, updateVehicle, type VehicleDetail, type VehicleOwnerChange } from './api';
import { ArchiveButton, ArchivedBanner } from './ArchiveControls';
import { TransferVehicleDialog } from './TransferVehicleDialog';
import {
  DEADLINE_LABELS,
  DEADLINE_BADGE_CLASS,
  deadlineStatus,
  tailgateDueEnd,
  mileageHistory,
  vehicleFromForm,
  vehicleSchema,
  vehicleToForm,
  type VehicleValues,
} from './domain';
import { useCustomerMutation, useVehicle } from './hooks';
import { buildMaintenanceBookPdf } from './maintenance-book-pdf';
import { addMonths } from '@/lib/month';

const selectClass = 'inp';

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
  const { vehicle, owners, orders, lines } = detail;
  const today = todayIso();
  const [appointment, setAppointment] = useState(false);
  const [book, setBook] = useState<PdfFile | null>(null);
  const [bookPending, setBookPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const { data: profile } = useProfile();
  const isDirection = profile?.role === 'direction';
  const navigate = useNavigate();
  const remove = useCustomerMutation((vehicleId: string) => deleteVehicle(vehicleId), 'Véhicule supprimé');
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<VehicleValues>({ resolver: zodResolver(vehicleSchema), defaultValues: vehicleToForm(vehicle) });
  const [ctDue, tailgateDue, antipollutionDue, vehicleType] = useWatch({
    control,
    name: ['ct_due_date', 'tailgate_due_date', 'antipollution_due_date', 'vehicle_type'],
  });
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

  const model = [vehicle.brand, vehicle.model].filter(Boolean).join(' ');

  return (
    <>
      <PageHeader
        back={{
          to: vehicle.client_id ? `/clients/${vehicle.client_id}` : '/vehicules',
          label: vehicle.client_id ? 'Retour au client' : 'Retour aux véhicules',
        }}
        crumbs={[{ label: 'Véhicules', to: '/vehicules' }, { label: 'Fiche véhicule' }]}
        title={
          <>
            <span className="plate-tag h-8 text-xl">{vehicle.plate}</span>
            {model && <span className="text-[22px]">{model}</span>}
          </>
        }
        actions={
          <>
            {isDirection && orders.length === 0 && (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Supprimer
              </Button>
            )}
            {isDirection && !vehicle.archived_at && (
              <ArchiveButton kind="vehicle" id={vehicle.id} name={vehicle.plate} />
            )}
            <Button
              variant="outline"
              disabled={bookPending || orders.length === 0}
              onClick={() => void openBook()}
            >
              <Download /> Carnet d’entretien (PDF)
            </Button>
            <Button variant="outline" onClick={() => setTransferring(true)}>
              <ArrowRightLeft /> Transférer à un autre client
            </Button>
            <Button variant="outline" onClick={() => setAppointment(true)}>
              <CalendarDays /> Prendre rendez-vous
            </Button>
            <Button asChild>
              <Link to="/or/nouveau">
                <Plus /> Nouvel OR
              </Link>
            </Button>
          </>
        }
      />

      {vehicle.archived_at && (
        <ArchivedBanner
          kind="vehicle"
          id={vehicle.id}
          archivedAt={vehicle.archived_at}
          canRestore={isDirection}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Supprimer ${vehicle.plate} ?`}
        description="Possible seulement pour un véhicule sans OR, devis ni rendez-vous. Sinon, archive-le."
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(vehicle.id, {
            onSuccess: () =>
              void navigate(vehicle.client_id ? `/clients/${vehicle.client_id}` : '/vehicules'),
          })
        }
      />
      <form
        noValidate
        className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_420px]!"
        onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: () => reset(values) }))}
      >
        <div className="col gap-5">
          <section data-slot="card" className="card" aria-labelledby="vehicle-identification">
            <div className="card-h">
              <h2 className="h2" id="vehicle-identification">
                Identification
              </h2>
              <Button type="submit" size="sm" disabled={!isDirty || save.isPending}>
                Enregistrer
              </Button>
            </div>
            <div className="card-b col gap-3.5">
              <div className="grid gap-3.5 sm:grid-cols-3">
                <FormField
                  id="vehicle-plate"
                  label="Immatriculation"
                  className="plate uppercase"
                  error={errors.plate?.message}
                  {...plateField}
                  onChange={(event) =>
                    setValue('plate', formatPlate(event.target.value), { shouldDirty: true })
                  }
                />
                <FormField id="vehicle-brand" label="Marque" {...register('brand')} />
                <FormField id="vehicle-model" label="Modèle" {...register('model')} />
              </div>
              <div className="grid gap-3.5 sm:grid-cols-[2fr_1fr_1fr]">
                <FormField
                  id="vehicle-vin"
                  label="N° de série (VIN)"
                  className="num uppercase"
                  {...register('vin')}
                />
                <FormField
                  id="vehicle-first-registration"
                  label="Mise en circulation"
                  type="date"
                  {...register('first_registration_date')}
                />
                <div className="field">
                  <Label htmlFor="vehicle-type">Type</Label>
                  <select id="vehicle-type" className={selectClass} {...register('vehicle_type')}>
                    {Object.entries(VEHICLE_TYPES).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="row gap-2.5 text-[13.5px]">
                <span className="muted">Client :</span>
                {vehicle.client_id ? (
                  <Link className="link" to={`/clients/${vehicle.client_id}`}>
                    {vehicle.client_name}
                  </Link>
                ) : (
                  <span>sans client</span>
                )}
              </div>
            </div>
          </section>

          {points.length >= 2 && (
            <section data-slot="card" className="card" aria-labelledby="vehicle-mileage">
              <div className="card-h flex-wrap">
                <h2 className="h2" id="vehicle-mileage">
                  Kilométrage
                </h2>
                <span className="hint">
                  {vehicle.last_mileage
                    ? `Dernier km : ${vehicle.last_mileage.toLocaleString('fr-FR')} km`
                    : ''}
                  {perYear !== null && ` · ≈ ${perYear.toLocaleString('fr-FR')} km / an`}
                </span>
              </div>
              <div className="card-b">
                <MileageChart points={points} />
              </div>
            </section>
          )}
          {points.length < 2 && vehicle.last_mileage ? (
            <p className="hint">Dernier km : {vehicle.last_mileage.toLocaleString('fr-FR')} km</p>
          ) : null}

          <section data-slot="card" className="card" aria-label="Historique des passages">
            <div className="card-h">
              <h2 className="h2">Passages à l’atelier</h2>
              <span className="cnt">{orders.length}</span>
            </div>
            {orders.length === 0 ? (
              <p className="card-b hint">Aucun passage à l’atelier.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl dense">
                  <thead>
                    <tr>
                      <th>OR</th>
                      <th>Date</th>
                      {owners.length > 0 && <th>Client</th>}
                      <th>Travaux</th>
                      <th className="r">Km</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const work = lines
                        .filter((line) => line.repair_order_id === order.id && line.line_type !== 'text')
                        .map((line) => line.description.split('\n')[0])
                        .join(' · ');
                      return (
                        <tr key={order.id}>
                          <td>
                            <Link className="b ul" to={`/or/${order.id}`}>
                              {order.number}
                            </Link>
                          </td>
                          <td className="num">{formatDate(order.created_at)}</td>
                          {owners.length > 0 && (
                            <td className="whitespace-nowrap">
                              {order.client_id === vehicle.client_id ? (
                                order.client_name
                              ) : (
                                <span className="muted">{order.client_name}</span>
                              )}
                            </td>
                          )}
                          <td className="max-w-[320px] truncate whitespace-nowrap">
                            {work || taskSummary(order.requested_work)}
                          </td>
                          <td className="r num">
                            {order.mileage ? order.mileage.toLocaleString('fr-FR') : '-'}
                          </td>
                          <td>
                            <StatusBadge
                              status={order.status}
                              technicianId={order.technician_id}
                              quoteSent={order.quote_sent}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="col gap-5">
          <section data-slot="card" className="card" aria-labelledby="vehicle-deadlines">
            <div className="card-h">
              <h2 className="h2" id="vehicle-deadlines">
                Échéances du véhicule
              </h2>
            </div>
            <div className="card-b col gap-3.5">
              {(
                [
                  ['ct', 'ct_due_date', ctDue],
                  ['tailgate', 'tailgate_due_date', tailgateDue],
                  ...(vehicleType === 'vul'
                    ? ([['antipollution', 'antipollution_due_date', antipollutionDue]] as const)
                    : []),
                ] as const
              ).map(([kind, field, value]) => {
                // Hayon : mois et année seulement, valable jusqu'à la fin du mois
                const status = deadlineStatus(kind === 'tailgate' ? tailgateDueEnd(value) : value, today);
                return kind === 'tailgate' ? (
                  <div key={kind} className="row items-end gap-2">
                    <Controller
                      control={control}
                      name="tailgate_due_date"
                      render={({ field: month }) => (
                        <MonthYearField
                          id="vehicle-tailgate"
                          className="grow"
                          label={DEADLINE_LABELS.tailgate}
                          value={month.value}
                          onChange={month.onChange}
                        />
                      )}
                    />
                    {status ? (
                      <span className={`badge mb-1.5 shrink-0 ${DEADLINE_BADGE_CLASS[status.tone]}`}>
                        {status.label}
                      </span>
                    ) : (
                      <span className="muted mb-2">-</span>
                    )}
                    {/* Contrôle refait ce mois-ci : prochain dans 6 mois (aussi automatique au devis) */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mb-0.5 shrink-0"
                      title="Contrôle hayon refait ce mois-ci : prochain dans 6 mois"
                      onClick={() =>
                        setValue('tailgate_due_date', addMonths(today, 6), { shouldDirty: true })
                      }
                    >
                      Renouvelé (+6 mois)
                    </Button>
                  </div>
                ) : (
                  <div key={kind} className="field">
                    <Label htmlFor={`vehicle-${kind}`}>{DEADLINE_LABELS[kind]}</Label>
                    <div className="row gap-2">
                      <Input id={`vehicle-${kind}`} type="date" {...register(field)} />
                      {status ? (
                        <span className={`badge shrink-0 ${DEADLINE_BADGE_CLASS[status.tone]}`}>
                          {status.label}
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {owners.length > 0 && <OwnersCard owners={owners} createdAt={vehicle.created_at} />}

          <section data-slot="card" className="card" aria-labelledby="vehicle-registration">
            <div className="card-h flex-wrap">
              <h2 className="h2" id="vehicle-registration">
                Carte grise
              </h2>
              <ImageUploadButton
                category="registration_doc"
                onUploaded={(fileId) => saveDocument.mutate(fileId)}
              >
                {vehicle.registration_doc_file_id ? 'Remplacer la carte grise' : 'Ajouter la carte grise'}
              </ImageUploadButton>
            </div>
            <div className="card-b">
              {vehicle.registration_doc_file_id ? (
                <StoredImage
                  fileId={vehicle.registration_doc_file_id}
                  alt={`Carte grise ${vehicle.plate}`}
                  className="max-h-56 w-full rounded-[7px] border object-contain"
                />
              ) : (
                <div className="photo h-[200px]">
                  <ImageIcon className="i xl" />
                  Aucune carte grise
                </div>
              )}
            </div>
          </section>

          <section data-slot="card" className="card" aria-labelledby="vehicle-notes-title">
            <div className="card-h">
              <h2 className="h2" id="vehicle-notes-title">
                Notes
              </h2>
            </div>
            <div className="card-b">
              <Label htmlFor="vehicle-notes" className="sr-only">
                Notes
              </Label>
              <Textarea id="vehicle-notes" rows={4} {...register('notes')} />
            </div>
          </section>
        </div>
      </form>

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
      {transferring && <TransferVehicleDialog vehicle={vehicle} onClose={() => setTransferring(false)} />}
    </>
  );
}

/** Propriétaires successifs : le premier depuis l'entrée du véhicule, puis un par transfert. */
function OwnersCard({ owners, createdAt }: { owners: VehicleOwnerChange[]; createdAt: string }) {
  const periods = [
    { key: 'first', name: owners[0]?.from_client_name, since: createdAt, note: null },
    ...owners.map((change) => ({
      key: change.id,
      name: change.to_client_name,
      since: change.changed_at,
      note: change.note,
    })),
  ].reverse();
  return (
    <section data-slot="card" className="card" aria-labelledby="vehicle-owners">
      <div className="card-h">
        <h2 className="h2" id="vehicle-owners">
          Propriétaires
        </h2>
        <span className="cnt">{periods.length}</span>
      </div>
      <ol className="card-b col gap-2.5">
        {periods.map((period, index) => (
          <li key={period.key} className="col gap-0.5">
            <span className="row wrap gap-x-2">
              <b>{period.name ?? 'Sans client'}</b>
              {index === 0 && <span className="badge s-ok">Actuel</span>}
            </span>
            <span className="hint">
              {period.key === 'first' ? 'Dans l’appli depuis le' : 'Depuis le'} {formatDate(period.since)}
              {period.note && ` · ${period.note}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
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

  const grid = [0.15, 0.5, 0.85].map((ratio) => 10 + ratio * (height - 40));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-[170px] w-full"
      role="img"
      aria-label={`Kilométrage : de ${minK.toLocaleString('fr-FR')} à ${maxK.toLocaleString('fr-FR')} km`}
    >
      <g stroke="var(--border)" strokeWidth="1">
        {grid.map((lineY) => (
          <line key={lineY} x1="40" y1={lineY} x2={width - 10} y2={lineY} />
        ))}
      </g>
      <g fill="var(--muted-foreground)" fontSize="11">
        <text x="0" y="14">
          {Math.round(maxK / 1000)}k
        </text>
        <text x="0" y={height - 16}>
          {Math.round(minK / 1000)}k
        </text>
      </g>
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        points={coords.map((c) => c.join(',')).join(' ')}
      />
      {coords.map(([cx, cy], index) => (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r="4"
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth="2"
        />
      ))}
    </svg>
  );
}
