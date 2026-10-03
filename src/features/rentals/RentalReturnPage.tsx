import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowRight, Circle, CircleCheck, Plus, Receipt, Trash2, Undo2 } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/features/repair-orders/schemas';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { vehicleTitle } from './fleet-domain';
import { InspectionEditor } from './InspectionEditor';
import { closeRental, returnRental, type RentalDetail } from './rental-api';
import {
  lineTotal,
  parisInstant,
  parisParts,
  proposedLines,
  returnFees,
  round2,
  shortDateTime,
  type ProposedLine,
} from './rental-domain';
import { useMissing, useRental, useRentalMutation } from './rental-hooks';
import { Stepper } from './ui';

const STEPS = ['État des lieux de retour', 'Frais et facture'];

/** Retour du véhicule : état des lieux comparé au départ, puis frais et facture (brouillon). */
export function RentalReturnPage() {
  const { id = '' } = useParams();
  const detail = useRental(id);
  if (detail.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (detail.isError) return <p className="text-destructive">Impossible de charger le contrat.</p>;
  if (!detail.data) return <p className="text-muted-foreground">Contrat introuvable.</p>;
  const { status } = detail.data.rental;
  if (status !== 'active' && status !== 'returned') {
    return (
      <p className="empty">
        {status === 'reserved' ? 'Le véhicule n’est pas encore parti.' : 'Ce contrat est clôturé.'}{' '}
        <Link className="link" to={`/location/contrats/${id}`}>
          Ouvrir le contrat
        </Link>
      </p>
    );
  }
  return <Return detail={detail.data} />;
}

function Return({ detail }: { detail: RentalDetail }) {
  const { rental, vehicle, client } = detail;
  const navigate = useNavigate();
  const returned = rental.status === 'returned';
  const now = parisParts(new Date().toISOString());
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const missing = useMissing(rental.id, 'return', !returned);
  const missingList = missing.data ?? [];
  const register = useRentalMutation(
    () => returnRental(rental.id, parisInstant(date, time)),
    'Retour enregistré',
  );
  const returnedAt =
    rental.returned_at ?? (date && time ? parisInstant(date, time) : new Date().toISOString());
  const lateMs = Date.parse(returnedAt) - Date.parse(rental.planned_return_at);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Location' },
          { label: rental.number, to: `/location/contrats/${rental.id}` },
          { label: 'Retour' },
        ]}
        back={{ to: `/location/contrats/${rental.id}`, label: 'Retour au contrat' }}
        title="Retour du véhicule"
        actions={
          <span className="sub hidden md:inline">
            {vehicle.plate} · {vehicleTitle(vehicle)} · {client.name}
          </span>
        }
      />
      <Stepper steps={STEPS} current={returned ? 1 : 0} done={returned ? [0] : []} />

      {returned ? (
        <FeesStep
          detail={detail}
          onClosed={(invoiceId) =>
            void navigate(invoiceId ? `/factures/${invoiceId}` : `/location/contrats/${rental.id}`)
          }
        />
      ) : (
        <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_320px]!">
          <div className="col gap-4">
            <section data-slot="card" className="card" aria-labelledby="return-date">
              <div className="card-h">
                <h2 className="h2" id="return-date">
                  Date et heure de retour
                </h2>
              </div>
              <div className="card-b grid gap-3.5 sm:grid-cols-3">
                <div className="field">
                  <Label htmlFor="returned-date">Date de retour *</Label>
                  <Input
                    id="returned-date"
                    type="date"
                    max={todayIso()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="returned-time">Heure de retour *</Label>
                  <Input
                    id="returned-time"
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </div>
                <div className="field">
                  <span className="lbl">Écart</span>
                  <span className={cn('badge dot w-fit', lateMs > 3_600_000 ? 's-bad' : 's-ok')}>
                    {lateMs > 3_600_000 ? `En retard de ${Math.ceil(lateMs / 3_600_000)} h` : 'À l’heure'}
                  </span>
                </div>
              </div>
            </section>
            <InspectionEditor detail={detail} phase="return" editable required={rental.kind === 'rental'} />
            <div className="row between">
              <Button variant="outline" asChild>
                <Link to={`/location/contrats/${rental.id}`}>Annuler</Link>
              </Button>
              <Button
                disabled={missingList.length > 0 || !date || !time || register.isPending}
                onClick={() => register.mutate(undefined)}
              >
                <Undo2 /> Enregistrer le retour <ArrowRight />
              </Button>
            </div>
          </div>
          <aside>
            <section data-slot="card" className="card" aria-labelledby="return-required">
              <div className="card-h">
                <h2 className="h2" id="return-required">
                  Obligatoire avant la facture
                </h2>
              </div>
              <ul className="card-b col gap-2.5">
                <li className="row gap-2.5">
                  <CircleCheck className="i s shrink-0 text-primary" /> Date et heure de retour
                </li>
                {missingList.map((item) => (
                  <li key={item} className="row gap-2.5">
                    <Circle className="i s shrink-0 text-muted-foreground" /> {item}
                  </li>
                ))}
                {missing.isSuccess && missingList.length === 0 && (
                  <li className="row gap-2.5">
                    <CircleCheck className="i s shrink-0 text-primary" />
                    {rental.kind === 'rental'
                      ? 'Photos et relevés du retour'
                      : 'Prêt : rien d’autre d’obligatoire'}
                  </li>
                )}
              </ul>
              <p className="card-b hint">
                Départ : {shortDateTime(rental.departed_at ?? rental.departure_at)}
              </p>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function FeesStep({
  detail,
  onClosed,
}: {
  detail: RentalDetail;
  onClosed: (invoiceId: string | null) => void;
}) {
  const { rental, vehicle, inspections } = detail;
  const departure = inspections.find((item) => item.phase === 'departure');
  const back = inspections.find((item) => item.phase === 'return');
  const fees = returnFees(rental, vehicle, departure, back, rental.returned_at ?? new Date().toISOString());
  const proposed = useMemo(
    () =>
      proposedLines(
        rental,
        vehicle,
        fees,
        rental.returned_at ?? new Date().toISOString(),
        back?.clean ?? null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rental.id],
  );
  const [lines, setLines] = useState<ProposedLine[]>(proposed);
  const kept = lines.filter((line) => line.checked);
  const totalHt = round2(kept.reduce((sum, line) => sum + lineTotal(line), 0));
  const invalid = kept.some(
    (line) =>
      !line.description.trim() || !Number.isFinite(line.quantity) || !Number.isFinite(line.unit_price),
  );
  const close = useRentalMutation(
    () =>
      closeRental(
        rental.id,
        kept.map(({ description, quantity, unit_price }) => ({
          description: description.trim(),
          quantity,
          unit_price,
        })),
      ),
    kept.length ? 'Facture préparée en brouillon' : 'Contrat clôturé',
  );
  const update = (key: string, patch: Partial<ProposedLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const num = (value: string) => Number(value.replace(',', '.'));

  return (
    <div className="split grid-cols-1! lg:grid-cols-[minmax(0,1fr)_340px]!">
      <section data-slot="card" className="card" aria-labelledby="fees-lines">
        <div className="card-h">
          <h2 className="h2" id="fees-lines">
            Lignes de la facture
          </h2>
        </div>
        {lines.length === 0 && (
          <p className="card-b hint">
            Prêt gratuit : rien à facturer. Ajoute une ligne si des frais sont dus.
          </p>
        )}
        <ul className="col">
          {lines.map((line) => (
            <li key={line.key} className={cn('li items-start gap-3', !line.checked && 'opacity-60')}>
              <input
                type="checkbox"
                className="mt-2.5"
                aria-label={`Facturer : ${line.description || 'ligne'}`}
                checked={line.checked}
                onChange={(event) => update(line.key, { checked: event.target.checked })}
              />
              <div className="col min-w-0 grow gap-1.5">
                <Input
                  aria-label="Désignation"
                  value={line.description}
                  onChange={(event) => update(line.key, { description: event.target.value })}
                />
                {line.detail && <span className="hint">{line.detail}</span>}
              </div>
              <Input
                aria-label={`Quantité : ${line.description}`}
                className="num w-20"
                inputMode="decimal"
                value={String(line.quantity).replace('.', ',')}
                onChange={(event) => update(line.key, { quantity: num(event.target.value) })}
              />
              <Input
                aria-label={`Prix unitaire HT : ${line.description}`}
                className="num w-24"
                inputMode="decimal"
                value={String(line.unit_price).replace('.', ',')}
                onChange={(event) => update(line.key, { unit_price: num(event.target.value) })}
              />
              <span className="num b w-24 pt-2 text-right">
                {line.checked ? formatEuro(lineTotal(line)) : '—'}
              </span>
              {line.key.startsWith('extra') && (
                <button
                  type="button"
                  className="ibtn sm ghost mt-1"
                  aria-label="Retirer la ligne"
                  onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                >
                  <Trash2 className="i s" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="card-b row between flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setLines((current) => [
                ...current,
                {
                  key: `extra-${current.length}`,
                  description: '',
                  detail: '',
                  quantity: 1,
                  unit_price: 0,
                  checked: true,
                },
              ])
            }
          >
            <Plus /> Ajouter une ligne
          </Button>
          <span className="hint">
            Ex. : dommage constaté, dans la limite de la franchise. Montants modifiables.
          </span>
        </div>
      </section>

      <aside className="col gap-4">
        <section data-slot="card" className="card" aria-labelledby="fees-total">
          <div className="card-h">
            <h2 className="h2" id="fees-total">
              Total
            </h2>
          </div>
          <dl className="card-b dl">
            <dt>Total HT</dt>
            <dd className="num">{formatEuro(totalHt)}</dd>
            <dt>TVA 20 %</dt>
            <dd className="num">{formatEuro(round2(totalHt * 0.2))}</dd>
            <dt>Total TTC</dt>
            <dd className="num b">{formatEuro(round2(totalHt * 1.2))}</dd>
            {fees.distance !== null && (
              <>
                <dt>Parcouru</dt>
                <dd>{fees.distance.toLocaleString('fr-FR')} km</dd>
              </>
            )}
          </dl>
          <div className="card-b">
            <Button
              className="w-full"
              disabled={invalid || close.isPending}
              onClick={() => close.mutate(undefined, { onSuccess: (invoiceId) => onClosed(invoiceId) })}
            >
              <Receipt /> {kept.length ? 'Créer la facture' : 'Clôturer sans facture'}
            </Button>
          </div>
          <p className="card-b hint">
            La facture est créée en brouillon : elle se vérifie et s’émet depuis la facturation. Caution :{' '}
            {formatEuro(rental.deposit)} à libérer ou encaisser.
          </p>
        </section>
      </aside>
    </div>
  );
}
