import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  CalendarClock,
  CircleCheck,
  Circle,
  Euro,
  FileText,
  FolderOpen,
  Fuel,
  Gauge,
  KeyRound,
  Loader2,
  Receipt,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { PdfPreviewDialog, type PdfFile } from '@/components/PdfPreviewDialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StoredImage } from '@/features/files/StoredImage';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { hasEngine, vehicleTitle } from './fleet-domain';
import { updateRental, type RentalDetail } from './rental-api';
import {
  present,
  DEPOSIT_MODES,
  fuelLabel,
  KIND_LABELS,
  parisInstant,
  parisParts,
  RATE_PERIODS,
  rentalBase,
  rentalStatus,
  shortDateTime,
  SIDE_SLOTS,
} from './rental-domain';
import { useRental, useRentalMutation } from './rental-hooks';
import { buildRentalPdf } from './rental-pdf';
import { RemoteSignature, RentalInvoiceCard, SendContractButton } from './RentalSend';
import { Kpi } from './ui';

/** Fiche d'un contrat de location ou de prêt : parties, véhicule, état des lieux, suivi. */
export function RentalPage() {
  const { id = '' } = useParams();
  const detail = useRental(id);
  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger le contrat.</p>;
  if (!detail.data) return <p className="text-muted-foreground">Contrat introuvable.</p>;
  return <RentalView detail={detail.data} />;
}

function RentalView({ detail }: { detail: RentalDetail }) {
  const { rental, vehicle, client, license, photos, damages, inspections } = detail;
  const status = rentalStatus(rental);
  const engine = hasEngine(vehicle.category);
  const departure = inspections.find((item) => item.phase === 'departure');
  const back = inspections.find((item) => item.phase === 'return');
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const [extending, setExtending] = useState(false);
  const period = RATE_PERIODS.find((entry) => entry.value === rental.rate_period) ?? RATE_PERIODS[0];

  const openPdf = async () => {
    setPdfPending(true);
    try {
      setPdf(await buildRentalPdf(detail));
    } catch {
      toast.error('Contrat PDF impossible à générer');
    } finally {
      setPdfPending(false);
    }
  };

  const [now] = useState(() => Date.now());
  const remaining = Date.parse(rental.planned_return_at) - now;
  const remainingText =
    remaining > 0
      ? `${Math.floor(remaining / 86_400_000)} j ${Math.floor((remaining % 86_400_000) / 3_600_000)} h`
      : 'Dépassé';

  const timeline = [
    {
      label: rental.kind === 'loan' ? 'Prêt prévu' : 'Contrat réservé',
      at: rental.created_at,
      done: true,
    },
    {
      label: 'Contrat signé',
      at: rental.signed_at,
      done: Boolean(rental.signed_at),
      hidden: !rental.signed_at && rental.kind === 'loan',
    },
    {
      label: 'Clés remises · départ',
      at: rental.departed_at ?? rental.departure_at,
      done: Boolean(rental.departed_at),
    },
    {
      label: 'Retour et état des lieux',
      at: rental.returned_at ?? rental.planned_return_at,
      done: Boolean(rental.returned_at),
    },
    {
      label: rental.invoice_number ? `Facture ${rental.invoice_number}` : 'Clôture',
      at: rental.closed_at,
      done: Boolean(rental.closed_at),
    },
  ].filter((step) => !step.hidden);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Location' },
          { label: 'Locations', to: '/location/contrats' },
          { label: rental.number },
        ]}
        back={{ to: '/location/contrats', label: 'Retour aux locations' }}
        title={
          <span className="row flex-wrap gap-x-3 gap-y-1">
            {rental.number}
            <span className="tag text-[12.5px]">{KIND_LABELS[rental.kind]}</span>
            <span className={cn('badge lg', status.tone)}>{status.label}</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" disabled={pdfPending} onClick={() => void openPdf()}>
              {pdfPending ? <Loader2 className="animate-spin" /> : <FileText />}{' '}
              {rental.kind === 'loan' ? 'Bon de prêt' : 'Contrat PDF'}
            </Button>
            <SendContractButton detail={detail} />
            {rental.status === 'active' && (
              <Button variant="outline" onClick={() => setExtending(true)}>
                <CalendarClock /> Prolonger
              </Button>
            )}
            {rental.status === 'reserved' && (
              <Button asChild>
                <Link to={`/location/contrats/${rental.id}/depart`}>
                  <KeyRound /> Préparer le départ
                </Link>
              </Button>
            )}
            {(rental.status === 'active' || rental.status === 'returned') && (
              <Button asChild>
                <Link to={`/location/contrats/${rental.id}/retour`}>
                  <Undo2 /> {rental.status === 'active' ? 'Enregistrer le retour' : 'Facturer le retour'}
                </Link>
              </Button>
            )}
            {rental.invoice_id && (
              <Button variant="outline" asChild>
                <Link to={`/factures/${rental.invoice_id}`}>
                  <Receipt /> Facture
                </Link>
              </Button>
            )}
          </>
        }
      />

      <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        <Kpi
          icon={<CalendarClock className="i s" />}
          value={rental.status === 'active' ? remainingText : shortDateTime(rental.planned_return_at)}
          label={
            rental.status === 'active'
              ? `Avant le retour · ${shortDateTime(rental.planned_return_at)}`
              : 'Retour prévu'
          }
          tone={rental.is_late ? 'hot' : undefined}
        />
        <Kpi
          icon={<Gauge className="i s" />}
          value={engine && present(departure?.mileage) ? departure.mileage.toLocaleString('fr-FR') : '—'}
          label={`Km au départ${rental.km_included ? ` · ${rental.km_included} km inclus` : ''}`}
        />
        <Kpi
          icon={<Fuel className="i s" />}
          value={engine ? fuelLabel(departure?.fuel_eighths) : '—'}
          label="Carburant au départ"
        />
        <Kpi
          icon={<Euro className="i s" />}
          value={rental.billable ? formatEuro(rental.estimated_ht) : 'Gratuit'}
          label={rental.billable ? `Estimé HT · caution ${formatEuro(rental.deposit)}` : 'Prêt de courtoisie'}
        />
      </ul>

      <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_340px]!">
        <div className="col gap-5">
          <div className="grid items-start gap-4 md:grid-cols-2">
            <section data-slot="card" className="card" aria-labelledby="rental-client">
              <div className="card-h">
                <h2 className="h2" id="rental-client">
                  {rental.kind === 'loan' ? 'Client' : 'Locataire'}
                </h2>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/clients/${client.id}`}>Fiche client</Link>
                </Button>
              </div>
              <dl className="card-b dl">
                <dt>Nom</dt>
                <dd>{client.name}</dd>
                <dt>Téléphone</dt>
                <dd>{client.phone ?? '—'}</dd>
                <dt>E-mail</dt>
                <dd>{client.email ?? '—'}</dd>
                <dt>Permis</dt>
                <dd>
                  {license
                    ? `${license.license_number ?? '—'} · ${license.categories.join(' · ')}${
                        license.valid_until
                          ? ` · jusqu’au ${license.valid_until.split('-').reverse().join('/')}`
                          : ''
                      }`
                    : '—'}
                </dd>
              </dl>
            </section>
            <section data-slot="card" className="card" aria-labelledby="rental-vehicle">
              <div className="card-h">
                <h2 className="h2" id="rental-vehicle">
                  Véhicule
                </h2>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/location/flotte/${vehicle.id}`}>
                    <FolderOpen /> Boîte à gants
                  </Link>
                </Button>
              </div>
              <dl className="card-b dl">
                <dt>Véhicule</dt>
                <dd>
                  {vehicle.plate} · {vehicleTitle(vehicle)}
                </dd>
                <dt>Départ</dt>
                <dd>{shortDateTime(rental.departed_at ?? rental.departure_at)}</dd>
                <dt>Retour prévu</dt>
                <dd>{shortDateTime(rental.planned_return_at)}</dd>
                {rental.returned_at && (
                  <>
                    <dt>Rendu</dt>
                    <dd>{shortDateTime(rental.returned_at)}</dd>
                  </>
                )}
                {rental.repair_order_id && (
                  <>
                    <dt>OR</dt>
                    <dd>
                      <Link className="link" to={`/or/${rental.repair_order_id}`}>
                        {rental.repair_order_number}
                      </Link>
                    </dd>
                  </>
                )}
              </dl>
            </section>
          </div>

          {(['departure', 'return'] as const).map((phase) => {
            const inspection = phase === 'departure' ? departure : back;
            const phasePhotos = photos.filter((photo) => photo.phase === phase);
            if (!inspection && phasePhotos.length === 0) return null;
            const phaseDamages = damages.filter((item) => item.phase === phase);
            const ordered = [
              ...SIDE_SLOTS.map(({ slot, label }) => ({
                label,
                photo: phasePhotos.find((p) => p.slot === slot),
              })),
              { label: 'Tableau de bord', photo: phasePhotos.find((p) => p.slot === 'dashboard') },
              ...phasePhotos
                .filter((p) => p.slot === 'closeup')
                .map((photo, index) => ({ label: `Gros plan ${index + 1}`, photo })),
            ];
            return (
              <section key={phase} data-slot="card" className="card" aria-labelledby={`rental-${phase}`}>
                <div className="card-h">
                  <h2 className="h2" id={`rental-${phase}`}>
                    {phase === 'departure' ? 'État des lieux de départ' : 'État des lieux de retour'}
                  </h2>
                  {inspection && (
                    <span className="muted text-[12.5px]">{shortDateTime(inspection.inspected_at)}</span>
                  )}
                </div>
                <div className="card-b col gap-3">
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
                    {ordered.map(({ label, photo }) => (
                      <figure key={label} className="col gap-1">
                        <div className="aspect-[4/3] overflow-hidden rounded-[8px] border bg-muted">
                          {photo && (
                            <StoredImage
                              fileId={photo.file_id}
                              alt={`${label} (${phase === 'departure' ? 'départ' : 'retour'})`}
                              className="h-full w-full object-cover"
                            />
                          )}
                        </div>
                        <figcaption className="muted text-[12px]">{label}</figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="row flex-wrap gap-x-4 gap-y-1 text-[13px]">
                    {engine && (
                      <>
                        <span className="row gap-1.5">
                          <Gauge className="i xs" /> {inspection?.mileage?.toLocaleString('fr-FR') ?? '—'} km
                        </span>
                        <span className="row gap-1.5">
                          <Fuel className="i xs" /> {fuelLabel(inspection?.fuel_eighths)}
                        </span>
                      </>
                    )}
                    <span>
                      {phaseDamages.length
                        ? `${phaseDamages.length} dommage${phaseDamages.length > 1 ? 's' : ''} : ${phaseDamages.map((item) => item.label).join(' ; ')}`
                        : phase === 'departure'
                          ? 'Aucun dommage existant'
                          : 'Aucun nouveau dommage'}
                    </span>
                  </div>
                </div>
              </section>
            );
          })}

          {rental.billable && (
            <section data-slot="card" className="card" aria-labelledby="rental-conditions">
              <div className="card-h">
                <h2 className="h2" id="rental-conditions">
                  Conditions
                </h2>
              </div>
              <dl className="card-b dl">
                <dt>Tarif</dt>
                <dd>
                  {formatEuro(rental.unit_price)} HT / {period.unit} · {rental.periods}{' '}
                  {rental.periods > 1 ? period.units : period.unit}
                  {rental.discount_percent ? ` · remise ${rental.discount_percent} %` : ''} ={' '}
                  {formatEuro(rentalBase(rental))} HT
                </dd>
                <dt>Km inclus</dt>
                <dd>{present(rental.km_included) ? `${rental.km_included} km` : '—'}</dd>
                <dt>Km supplémentaire</dt>
                <dd>{present(rental.extra_km_price) ? `${formatEuro(rental.extra_km_price)} HT` : '—'}</dd>
                <dt>Carburant manquant</dt>
                <dd>
                  {present(rental.fuel_price_per_liter)
                    ? `${formatEuro(rental.fuel_price_per_liter)} / L`
                    : '—'}
                </dd>
                <dt>Caution</dt>
                <dd>
                  {formatEuro(rental.deposit)}
                  {rental.deposit_mode
                    ? ` · ${DEPOSIT_MODES.find((mode) => mode.value === rental.deposit_mode)?.label ?? ''}`
                    : ''}
                </dd>
                <dt>Franchise</dt>
                <dd>{present(rental.franchise) ? formatEuro(rental.franchise) : '—'}</dd>
              </dl>
            </section>
          )}
        </div>

        <aside className="col gap-5">
          <section data-slot="card" className="card" aria-labelledby="rental-timeline">
            <div className="card-h">
              <h2 className="h2" id="rental-timeline">
                Suivi
              </h2>
            </div>
            <ol className="card-b col gap-3.5">
              {timeline.map((step) => (
                <li key={step.label} className="row items-start gap-2.5">
                  {step.done ? (
                    <CircleCheck className="i s mt-0.5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="i s mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="c2">
                    <b className={cn(!step.done && 'font-medium')}>{step.label}</b>
                    <span>{step.at ? `${step.done ? '' : 'prévu '}${shortDateTime(step.at)}` : '—'}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          {rental.status === 'reserved' && !rental.signed_at && (
            <section data-slot="card" className="card" aria-labelledby="rental-signature">
              <div className="card-h">
                <h2 className="h2" id="rental-signature">
                  Signature du client
                </h2>
              </div>
              <div className="card-b col gap-2">
                <span className="hint">
                  À signer au comptoir au départ, ou à distance si le client ne vient pas lui-même.
                </span>
                <RemoteSignature detail={detail} />
              </div>
            </section>
          )}
          {rental.invoice_id && <RentalInvoiceCard invoiceId={rental.invoice_id} />}
          <NotesCard detail={detail} />
        </aside>
      </div>

      {extending && <ExtendDialog detail={detail} onClose={() => setExtending(false)} />}
      {pdf && <PdfPreviewDialog file={pdf} onClose={() => setPdf(null)} />}
    </>
  );
}

function NotesCard({ detail }: { detail: RentalDetail }) {
  const { rental } = detail;
  const [notes, setNotes] = useState(rental.notes ?? '');
  const editable = rental.status !== 'closed' && rental.status !== 'cancelled';
  const save = useRentalMutation(
    () => updateRental(rental.id, { notes: notes.trim() || null }),
    'Notes enregistrées',
  );
  return (
    <section data-slot="card" className="card" aria-labelledby="rental-notes">
      <div className="card-h">
        <h2 className="h2" id="rental-notes">
          Notes
        </h2>
        {editable && (
          <Button
            size="sm"
            variant="outline"
            disabled={notes === (rental.notes ?? '') || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            Enregistrer
          </Button>
        )}
      </div>
      <div className="card-b">
        <textarea
          aria-label="Notes du contrat"
          className="inp min-h-[80px] w-full py-2"
          disabled={!editable}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </section>
  );
}

/** Prolongation : nouveau retour prévu (refusé si le véhicule est réservé ensuite). */
function ExtendDialog({ detail, onClose }: { detail: RentalDetail; onClose: () => void }) {
  const { rental } = detail;
  const initial = parisParts(rental.planned_return_at);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const save = useRentalMutation(
    () => updateRental(rental.id, { planned_return_at: parisInstant(date, time) }),
    'Retour prévu modifié',
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Prolonger {rental.number}</DialogTitle>
          <DialogDescription>Refusé si le véhicule est déjà réservé après ce contrat.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="field">
            <Label htmlFor="extend-date">Nouveau retour prévu</Label>
            <Input
              id="extend-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="field">
            <Label htmlFor="extend-time">Heure</Label>
            <Input
              id="extend-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={!date || !time || save.isPending}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Prolonger
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
