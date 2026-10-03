import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarClock, Info, TriangleAlert, Truck } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { AppointmentDialog } from '@/features/planning/AppointmentDialog';
import type { AppointmentPreset } from '@/features/planning/schemas';
import { todayIso } from '@/features/repair-orders/schemas';
import { FleetDeadlines } from '@/features/rentals/FleetDeadlines';
import { fleetDeadlineRows } from '@/features/rentals/fleet-domain';
import { useFleet } from '@/features/rentals/fleet-hooks';
import { cn } from '@/lib/utils';
import { CustomersTabs } from './CustomersTabs';
import { DEADLINE_BADGE_CLASS, DEADLINE_LABELS, deadlineStatus, type DeadlineKind } from './domain';
import { useDeadlines } from './hooks';

const frenchDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Échéances véhicules dépassées ou dans les 30 jours (comme l'ancienne appli), et celles de la flotte de location. */
export function DeadlinesPage() {
  const deadlines = useDeadlines();
  const fleet = useFleet();
  const today = todayIso();
  const [params, setParams] = useSearchParams();
  const showFleet = params.get('vue') === 'flotte';
  const fleetRows = fleetDeadlineRows(fleet.data ?? [], today);
  const [booking, setBooking] = useState<AppointmentPreset | null>(null);
  const list = deadlines.data ?? [];
  const statuses = list.map((deadline) => deadlineStatus(deadline.due_date, today));
  const overdue = statuses.filter((status) => status?.tone === 'overdue').length;
  const vehicles = new Set(list.map((deadline) => deadline.vehicle_id)).size;

  return (
    <>
      <PageHeader crumbs={[{ label: 'Clients et véhicules' }, { label: 'Échéances' }]} title="Échéances" />

      <div className="col gap-4">
        <div className="toolbar">
          <CustomersTabs deadlines={list.length || undefined} />
        </div>
        <div className="seg w-fit" role="group" aria-label="Véhicules">
          {(
            [
              [false, 'Véhicules clients', list.length],
              [true, 'Flotte de location', fleetRows.length],
            ] as const
          ).map(([fleetView, label, count]) => (
            <button
              key={label}
              type="button"
              className={cn(showFleet === fleetView && 'on')}
              aria-pressed={showFleet === fleetView}
              onClick={() => setParams(fleetView ? { vue: 'flotte' } : {}, { replace: true })}
            >
              {label} {count > 0 && <span className="n">{count}</span>}
            </button>
          ))}
        </div>

        {showFleet && fleet.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {showFleet && fleet.isError && <p className="text-destructive">Impossible de charger la flotte.</p>}
        {showFleet && fleet.isSuccess && (
          <FleetDeadlines
            rows={fleetRows}
            today={today}
            onBook={(vehicle, reason) => setBooking({ plate: vehicle.plate, client_name: '', reason })}
          />
        )}

        {!showFleet && (
          <>
            <div className="alert s-blue">
              <Info className="i" />
              <span>
                Contrôles techniques et contrôles hayon dépassés ou dans les 30 prochains jours. Les dates se
                renseignent sur la fiche du véhicule (ou par le technicien depuis l’OR).
              </span>
            </div>

            {deadlines.isPending && <p className="text-muted-foreground">Chargement…</p>}
            {deadlines.isError && <p className="text-destructive">Impossible de charger les échéances.</p>}

            {deadlines.isSuccess && (
              <ul className="grid gap-3.5 sm:grid-cols-3">
                <li className="card kpi flex-row items-center">
                  <span className="kpi-ico down">
                    <TriangleAlert className="i s" />
                  </span>
                  <div className="col gap-0.5">
                    <span className={`kpi-v ${overdue > 0 ? 'down' : ''}`}>{overdue}</span>
                    <span className="kpi-l">Dépassées</span>
                  </div>
                </li>
                <li className="card kpi flex-row items-center">
                  <span className="kpi-ico warn-t">
                    <CalendarClock className="i s" />
                  </span>
                  <div className="col gap-0.5">
                    <span className="kpi-v">{list.length - overdue}</span>
                    <span className="kpi-l">Dans les 30 jours</span>
                  </div>
                </li>
                <li className="card kpi flex-row items-center">
                  <span className="kpi-ico">
                    <Truck className="i s" />
                  </span>
                  <div className="col gap-0.5">
                    <span className="kpi-v">{vehicles}</span>
                    <span className="kpi-l">Véhicules concernés</span>
                  </div>
                </li>
              </ul>
            )}

            {deadlines.isSuccess && list.length === 0 && <p className="empty">Aucune échéance proche.</p>}

            {list.length > 0 && (
              <div className="card tbl-wrap overflow-x-auto!">
                <table className="tbl" aria-label="Échéances">
                  <thead>
                    <tr>
                      <th>Véhicule</th>
                      <th>Échéance</th>
                      <th>Date</th>
                      <th>Client</th>
                      <th>État</th>
                      <th className="r">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((deadline, index) => {
                      const status = statuses[index];
                      const kind = (deadline.kind ?? 'ct') as DeadlineKind;
                      return (
                        <tr key={`${deadline.vehicle_id}-${kind}`}>
                          <td>
                            <Link to={`/vehicules/${deadline.vehicle_id}`} className="plate-tag">
                              {deadline.plate}
                            </Link>
                          </td>
                          <td className="b">{DEADLINE_LABELS[kind]}</td>
                          <td className="num">{deadline.due_date ? frenchDate(deadline.due_date) : '—'}</td>
                          <td>{deadline.client_name ?? '—'}</td>
                          <td>
                            {status && (
                              <span className={`badge ${DEADLINE_BADGE_CLASS[status.tone]}`}>
                                {status.label}
                              </span>
                            )}
                          </td>
                          <td className="r">
                            <Button
                              size="sm"
                              variant={status?.tone === 'overdue' ? 'default' : 'outline'}
                              onClick={() =>
                                setBooking({
                                  plate: deadline.plate ?? '',
                                  client_name: deadline.client_name ?? '',
                                  reason: DEADLINE_LABELS[kind],
                                })
                              }
                            >
                              Prendre rendez-vous
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {booking && <AppointmentDialog appointment={null} preset={booking} onClose={() => setBooking(null)} />}
    </>
  );
}
