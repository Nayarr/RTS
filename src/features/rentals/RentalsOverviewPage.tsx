import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CarFront, KeyRound, Plus, ShieldAlert, TriangleAlert, Wrench } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { blockReason, fleetDeadlineRows } from './fleet-domain';
import { useFleet } from './fleet-hooks';
import type { RentalOverview } from './rental-api';
import { KIND_LABELS, parisParts, rentalStatus, shortDateTime } from './rental-domain';
import { useRentals } from './rental-hooks';
import { Kpi, LocationTabs } from './ui';

const time = (iso: string) => parisParts(iso).time;

/** Vue d'ensemble de la location : véhicules disponibles, départs et retours du jour, retards, alertes. */
export function RentalsOverviewPage() {
  const rentals = useRentals();
  const fleet = useFleet();
  const today = todayIso();
  const list = rentals.data ?? [];
  const vehicles = (fleet.data ?? []).filter((vehicle) => vehicle.is_active);
  const out = list.filter((rental) => rental.status === 'active');
  const outIds = new Set(out.map((rental) => rental.fleet_vehicle_id));
  const available = vehicles.filter((vehicle) => !outIds.has(vehicle.id) && !blockReason(vehicle, today));
  const departures = list.filter(
    (rental) => rental.status === 'reserved' && parisParts(rental.departure_at).date === today,
  );
  const returns = list.filter(
    (rental) => rental.status === 'active' && parisParts(rental.planned_return_at).date <= today,
  );
  const late = out.filter((rental) => rental.is_late);
  const alerts = fleetDeadlineRows(vehicles, today).slice(0, 5);

  const row = (rental: RentalOverview, at: string, action: ReactNode) => (
    <li key={rental.id} className="li">
      <Link to={`/location/contrats/${rental.id}`} className="row min-w-0 gap-3">
        <span className={cn('num b w-11 shrink-0', rental.is_late && 'text-destructive')}>{time(at)}</span>
        <span className="c2 min-w-0">
          <b>
            {rental.client_name} · {rental.plate}
          </b>
          <span>
            {rental.number} · {KIND_LABELS[rental.kind]} · {rental.brand} {rental.model}
          </span>
        </span>
      </Link>
      {action}
    </li>
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Location' }, { label: 'Vue d’ensemble' }]}
        title="Location et prêt de véhicules"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/location/nouvelle?type=pret">
                <Wrench /> Prêter un véhicule
              </Link>
            </Button>
            <Button asChild>
              <Link to="/location/nouvelle">
                <Plus /> Nouvelle location
              </Link>
            </Button>
          </>
        }
      />
      <div className="col gap-5">
        <div className="toolbar flex-wrap">
          <LocationTabs />
        </div>
        <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          <Kpi
            icon={<CarFront className="i s" />}
            value={`${available.length} / ${vehicles.length}`}
            label="Véhicules disponibles"
          />
          <Kpi
            icon={<KeyRound className="i s" />}
            value={out.length}
            label={`Sortis (${out.filter((rental) => rental.kind === 'rental').length} locations, ${
              out.filter((rental) => rental.kind === 'loan').length
            } prêts)`}
          />
          <Kpi
            icon={<CalendarClock className="i s" />}
            value={departures.length + returns.length}
            label="Départs et retours du jour"
            tone={departures.length + returns.length ? 'warn' : undefined}
          />
          <Kpi
            icon={<TriangleAlert className="i s" />}
            value={late.length}
            label="Retours en retard"
            tone={late.length ? 'hot' : undefined}
          />
        </ul>

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section data-slot="card" className="card" aria-labelledby="overview-today">
            <div className="card-h">
              <h2 className="h2" id="overview-today">
                Aujourd’hui
              </h2>
            </div>
            <div className="li bg-head">
              <span className="overline">Départs</span>
              <span className="muted text-[12.5px]">{departures.length}</span>
            </div>
            <ul>
              {departures.map((rental) =>
                row(
                  rental,
                  rental.departure_at,
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/location/contrats/${rental.id}/depart`}>Préparer le départ</Link>
                  </Button>,
                ),
              )}
            </ul>
            <div className="li bg-head">
              <span className="overline">Retours</span>
              <span className="muted text-[12.5px]">{returns.length}</span>
            </div>
            <ul>
              {returns.map((rental) =>
                row(
                  rental,
                  rental.planned_return_at,
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/location/contrats/${rental.id}/retour`}>Enregistrer le retour</Link>
                  </Button>,
                ),
              )}
            </ul>
            {departures.length + returns.length === 0 && (
              <p className="card-b hint">Aucun départ ni retour prévu.</p>
            )}
          </section>

          <section data-slot="card" className="card" aria-labelledby="overview-alerts">
            <div className="card-h">
              <h2 className="h2" id="overview-alerts">
                Alertes flotte
              </h2>
              <Link to="/vehicules/echeances?vue=flotte" className="link text-[13px]">
                Échéances
              </Link>
            </div>
            {alerts.length === 0 ? (
              <p className="card-b hint">Aucune échéance proche sur la flotte.</p>
            ) : (
              <ul>
                {alerts.map(({ vehicle, deadline }) => (
                  <li key={`${vehicle.id}-${deadline.label}`} className="li">
                    <Link to={`/location/flotte/${vehicle.id}`} className="row min-w-0 gap-2.5">
                      <ShieldAlert
                        className={cn(
                          'i s shrink-0',
                          deadline.state === 'late' ? 'text-destructive' : 'warn-t',
                        )}
                      />
                      <span className="c2 min-w-0">
                        <b>
                          {vehicle.plate} · {deadline.label.toLowerCase()}
                        </b>
                        <span>
                          {deadline.when} · {deadline.text}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section data-slot="card" className="card" aria-labelledby="overview-active">
          <div className="card-h">
            <h2 className="h2" id="overview-active">
              Véhicules sortis
            </h2>
            <span className="cnt">{out.length}</span>
          </div>
          {out.length === 0 ? (
            <p className="card-b hint">Aucun véhicule sorti.</p>
          ) : (
            <ul>
              {out.map((rental) => {
                const state = rentalStatus(rental);
                return (
                  <li key={rental.id} className="li">
                    <Link to={`/location/contrats/${rental.id}`} className="c2 min-w-0">
                      <b>
                        {rental.number} · {rental.client_name}
                      </b>
                      <span>
                        {rental.plate} · retour prévu {shortDateTime(rental.planned_return_at)}
                      </span>
                    </Link>
                    <span className={cn('badge', state.tone)}>{state.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
