import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Info, KeyRound, UserPlus, Wrench } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { SearchField } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useClients } from '@/features/customers/hooks';
import { todayIso } from '@/features/repair-orders/schemas';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { FleetCategory } from './fleet-api';
import { blockReason, CATEGORIES, CATEGORY_META, vehicleTitle } from './fleet-domain';
import { useFleet } from './fleet-hooks';
import { createRental, type RentalKind } from './rental-api';
import {
  CONTRACT_UNITS,
  contractEnd,
  present,
  parisInstant,
  periodsFor,
  RENTAL_STEPS,
  rentalDays,
  vehicleFree,
  vehicleRate,
  type ContractUnit,
} from './rental-domain';
import { useBusyPeriods, useRentalMutation } from './rental-hooks';
import { Stepper, VehicleVisual } from './ui';

/**
 * Nouvelle location (ou nouveau prêt), étape 1 : client, véhicule libre sur la période,
 * date et heure de départ obligatoires. Le contrat est réservé puis complété (permis,
 * tarifs, état des lieux, signature) avant la remise des clés.
 */
export function NewRentalPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clients = useClients();
  const fleet = useFleet();
  const busy = useBusyPeriods();
  const today = todayIso();

  const [kind, setKind] = useState<RentalKind>(params.get('type') === 'pret' ? 'loan' : 'rental');
  // Prêt lancé depuis la fiche OR : rattaché à cet OR
  const repairOrderId = kind === 'loan' ? params.get('or') : null;
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState(params.get('client') ?? '');
  const [category, setCategory] = useState<FleetCategory | null>(null);
  const [vehicleId, setVehicleId] = useState(params.get('vehicule') ?? '');
  const [departureDate, setDepartureDate] = useState(today);
  const [departureTime, setDepartureTime] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [returnTime, setReturnTime] = useState('18:00');
  // Contrat au jour, au mois ou à l'année : la date de retour en découle, la reconduction aussi
  const [unit, setUnit] = useState<ContractUnit>('day');
  const [count, setCount] = useState('');
  const applyDuration = (nextUnit: ContractUnit, nextCount: string, start = departureDate) => {
    const n = Number(nextCount);
    if (start && Number.isInteger(n) && n > 0) setReturnDate(contractEnd(start, nextUnit, n));
  };

  const from = departureDate && departureTime ? parisInstant(departureDate, departureTime) : null;
  const to = returnDate ? parisInstant(returnDate, returnTime || '18:00') : null;
  const periodError =
    from && to && Date.parse(to) <= Date.parse(from) ? 'Le retour doit être après le départ' : null;

  const needle = search.trim().toLowerCase();
  const clientList = useMemo(
    () =>
      (clients.data ?? [])
        .filter(
          (client) =>
            !needle ||
            [client.name, client.phone, client.email].some((value) =>
              (value ?? '').toLowerCase().includes(needle),
            ),
        )
        .slice(0, needle ? 8 : 5),
    [clients.data, needle],
  );
  const client = (clients.data ?? []).find((item) => item.id === clientId) ?? null;

  const vehicles = (fleet.data ?? []).filter(
    (vehicle) =>
      vehicle.is_active &&
      (kind === 'rental' || vehicle.loanable) &&
      (!category || vehicle.category === category),
  );
  const availability = (vehicleIdToCheck: string) => {
    const vehicle = (fleet.data ?? []).find((item) => item.id === vehicleIdToCheck);
    if (!vehicle) return 'Véhicule introuvable';
    const blocked = blockReason(vehicle, departureDate || today);
    if (blocked) return blocked;
    if (from && to && !vehicleFree(vehicle.id, busy.data ?? [], from, to))
      return 'Déjà réservé sur la période';
    return null;
  };
  const vehicle = (fleet.data ?? []).find((item) => item.id === vehicleId) ?? null;
  const vehicleProblem = vehicle ? availability(vehicle.id) : null;

  const durationCount = Number(count);
  const durationPeriods =
    Number.isInteger(durationCount) &&
    durationCount > 0 &&
    returnDate === contractEnd(departureDate, unit, durationCount)
      ? durationCount
      : null;

  const create = useRentalMutation(() => {
    if (!vehicle || !client || !from || !to) throw new Error('Complète le client, le véhicule et les dates');
    const days = rentalDays(from, to);
    return createRental({
      kind,
      repair_order_id: repairOrderId,
      client_id: client.id,
      fleet_vehicle_id: vehicle.id,
      departure_at: from,
      planned_return_at: to,
      rate_period: unit,
      unit_price: kind === 'loan' ? 0 : (vehicleRate(vehicle, unit) ?? vehicle.daily_rate),
      // Durée saisie (2 mois = 2 périodes, quelle que soit la longueur des mois), sinon d'après les dates
      periods: durationPeriods ?? periodsFor(unit, days),
      tacit_renewal: kind === 'rental',
      km_included: present(vehicle.km_included_per_day) ? vehicle.km_included_per_day * days : null,
      extra_km_price: vehicle.extra_km_price,
      fuel_price_per_liter: vehicle.fuel_price_per_liter,
      cleaning_fee: vehicle.cleaning_fee,
      late_fee_per_hour: vehicle.late_fee_per_hour,
      deposit: kind === 'loan' ? 0 : vehicle.deposit,
      deposit_mode: kind === 'loan' ? null : 'card_hold',
      franchise: vehicle.franchise,
      billable: kind === 'rental',
    });
  });

  const ready = Boolean(client && vehicle && !vehicleProblem && from && to && !periodError);

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Location' },
          { label: 'Locations', to: '/location/contrats' },
          { label: 'Nouveau contrat' },
        ]}
        title={kind === 'loan' ? 'Nouveau prêt' : 'Nouvelle location'}
        back={{ to: '/location/contrats', label: 'Retour aux locations' }}
      />

      <Stepper steps={RENTAL_STEPS} current={0} />

      <div className="col gap-4">
        <section data-slot="card" className="card" aria-labelledby="rental-kind">
          <div className="card-h">
            <h2 className="h2" id="rental-kind">
              Type de contrat
            </h2>
          </div>
          <div className="card-b grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby="rental-kind">
            {(
              [
                ['rental', 'Location', 'Tarif à la journée, caution, facture au retour', KeyRound],
                ['loan', 'Prêt pendant un OR', 'Véhicule de courtoisie, gratuit ou facturé', Wrench],
              ] as const
            ).map(([value, label, hint, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={kind === value}
                className={cn(
                  'card row cursor-pointer items-center gap-3 p-3.5 text-left',
                  kind === value && 'border-primary bg-accent',
                )}
                onClick={() => setKind(value)}
              >
                <span className="c2 grow">
                  <b>{label}</b>
                  <span>{hint}</span>
                </span>
                <Icon
                  className={cn('i', kind === value ? 'text-accent-foreground' : 'text-muted-foreground')}
                />
              </button>
            ))}
          </div>
        </section>

        {repairOrderId && (
          <p className="alert s-blue">
            <Wrench className="i" />
            <span>Prêt rattaché à l’OR : il apparaîtra sur la fiche de l’intervention.</span>
          </p>
        )}

        <section data-slot="card" className="card" aria-labelledby="rental-client">
          <div className="card-h">
            <h2 className="h2" id="rental-client">
              Client
            </h2>
            <Button variant="outline" size="sm" asChild>
              <Link to="/clients/nouveau">
                <UserPlus /> Nouveau client
              </Link>
            </Button>
          </div>
          <div className="card-b col gap-3">
            {client ? (
              <div className="card row gap-3 p-3">
                <span className="av" aria-hidden>
                  {initials(client.name)}
                </span>
                <span className="c2 grow">
                  <b>{client.name}</b>
                  <span>{[client.phone, client.email].filter(Boolean).join(' · ') || '-'}</span>
                </span>
                <span className="tag">{client.kind === 'individual' ? 'Particulier' : 'Pro'}</span>
                <Button variant="ghost" size="sm" onClick={() => setClientId('')}>
                  Changer
                </Button>
              </div>
            ) : (
              <>
                <SearchField
                  aria-label="Rechercher un client"
                  placeholder="Nom, téléphone, e-mail…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <ul className="col" aria-label="Clients">
                  {clientList.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="li w-full cursor-pointer text-left hover:bg-hover"
                        onClick={() => setClientId(item.id)}
                      >
                        <span className="c2">
                          <b>{item.name}</b>
                          <span>{item.phone ?? item.email ?? ''}</span>
                        </span>
                        <span className="tag">{item.kind === 'individual' ? 'Particulier' : 'Pro'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {clients.isSuccess && clientList.length === 0 && (
                  <p className="hint">
                    Aucun client trouvé : crée-le d’abord (permis scanné pour un particulier).
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        <section data-slot="card" className="card" aria-labelledby="rental-dates">
          <div className="card-h">
            <h2 className="h2" id="rental-dates">
              Dates
            </h2>
          </div>
          <div className="card-b col gap-2.5">
            {kind === 'rental' && (
              <div className="row flex-wrap items-end gap-3.5">
                <div className="field">
                  <span className="lbl" id="contract-unit">
                    Contrat
                  </span>
                  <div className="seg w-fit" role="group" aria-labelledby="contract-unit">
                    {CONTRACT_UNITS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={cn(unit === option.value && 'on')}
                        aria-pressed={unit === option.value}
                        onClick={() => {
                          setUnit(option.value);
                          applyDuration(option.value, count);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field w-[140px]">
                  <Label htmlFor="contract-count">
                    Durée ({unit === 'day' ? 'jours' : unit === 'month' ? 'mois' : 'ans'})
                  </Label>
                  <Input
                    id="contract-count"
                    inputMode="numeric"
                    className="num"
                    value={count}
                    onChange={(event) => {
                      setCount(event.target.value);
                      applyDuration(unit, event.target.value);
                    }}
                  />
                </div>
                <p className="hint grow">
                  Tacite reconduction : non rendu à la date prévue, le contrat se prolonge d’
                  {unit === 'day' ? 'un jour' : unit === 'month' ? 'un mois' : 'un an'} à la fois.
                </p>
              </div>
            )}
            <div className="grid gap-3.5 sm:grid-cols-4">
              <div className="field">
                <Label htmlFor="departure-date">Date de départ *</Label>
                <Input
                  id="departure-date"
                  type="date"
                  value={departureDate}
                  onChange={(event) => {
                    setDepartureDate(event.target.value);
                    applyDuration(unit, count, event.target.value);
                  }}
                />
              </div>
              <div className="field">
                <Label htmlFor="departure-time">Heure de départ *</Label>
                <Input
                  id="departure-time"
                  type="time"
                  value={departureTime}
                  onChange={(event) => setDepartureTime(event.target.value)}
                />
              </div>
              <div className="field">
                <Label htmlFor="return-date">Date de retour prévue *</Label>
                <Input
                  id="return-date"
                  type="date"
                  min={departureDate}
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                />
              </div>
              <div className="field">
                <Label htmlFor="return-time">Heure de retour</Label>
                <Input
                  id="return-time"
                  type="time"
                  value={returnTime}
                  onChange={(event) => setReturnTime(event.target.value)}
                />
              </div>
            </div>
            {periodError ? (
              <p className="err">{periodError}</p>
            ) : (
              <p className="hint row gap-1.5">
                <Info className="i xs" /> La date et l’heure de départ sont obligatoires pour valider le
                contrat.
              </p>
            )}
          </div>
        </section>

        <section data-slot="card" className="card" aria-labelledby="rental-vehicle">
          <div className="card-h">
            <h2 className="h2" id="rental-vehicle">
              Véhicule
            </h2>
          </div>
          <div className="card-b col gap-3">
            <div className="chips" role="group" aria-label="Catégorie">
              <button
                type="button"
                className={cn('chip', !category && 'on')}
                aria-pressed={!category}
                onClick={() => setCategory(null)}
              >
                Tous
              </button>
              {CATEGORIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn('chip', category === value && 'on')}
                  aria-pressed={category === value}
                  onClick={() => setCategory(category === value ? null : value)}
                >
                  {CATEGORY_META[value].plural}
                </button>
              ))}
            </div>
            {fleet.isSuccess && vehicles.length === 0 && (
              <p className="hint">
                Aucun véhicule {kind === 'loan' ? 'prêtable ' : ''}dans la flotte.{' '}
                <Link to="/location/flotte/nouveau" className="link">
                  Ajouter un véhicule
                </Link>
              </p>
            )}
            <div className="grid gap-2.5 md:grid-cols-2" role="radiogroup" aria-label="Véhicule">
              {vehicles.map((item) => {
                const problem = availability(item.id);
                const on = vehicleId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={Boolean(problem)}
                    className={cn(
                      'card row cursor-pointer gap-3 p-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60',
                      on && 'border-primary shadow-[0_0_0_1px_var(--primary)]',
                    )}
                    onClick={() => setVehicleId(item.id)}
                  >
                    <VehicleVisual
                      category={item.category}
                      fileId={item.photo_file_id}
                      alt=""
                      className="h-[58px] w-[92px] shrink-0 rounded-[6px]"
                    />
                    <span className="col min-w-0 grow gap-1">
                      <span className="row gap-2">
                        <span className="plate">{item.plate}</span>
                        <span className={cn('badge', problem ? 's-bad' : 's-ok')}>
                          {problem ?? 'Disponible'}
                        </span>
                      </span>
                      <span className="muted text-[12.5px]">
                        {vehicleTitle(item)}
                        {present(item.mileage) ? ` · ${item.mileage.toLocaleString('fr-FR')} km` : ''}
                      </span>
                      {kind === 'rental' && (
                        <span className="text-[12.5px]">
                          <b>{formatEuro(item.daily_rate)} HT</b> / jour · permis {item.license_category}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="row between">
          <Button variant="outline" onClick={() => void navigate('/location/contrats')}>
            Annuler
          </Button>
          <Button
            disabled={!ready || create.isPending}
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: (id) => void navigate(`/location/contrats/${id}/depart`),
              })
            }
          >
            Continuer <ArrowRight />
          </Button>
        </div>
      </div>
    </>
  );
}
