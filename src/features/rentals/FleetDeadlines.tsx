import { Link } from 'react-router';
import { CalendarClock, Info, Upload, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FleetVehicle } from './fleet-api';
import { blockReason, DEADLINE_BADGE, vehicleTitle, type FleetDeadlineRow } from './fleet-domain';

/** Échéances de la flotte de location : contrôle technique, assurance, vidange. */
export function FleetDeadlines({
  rows,
  today,
  onBook,
}: {
  rows: FleetDeadlineRow[];
  today: string;
  onBook: (vehicle: FleetVehicle, reason: string) => void;
}) {
  return (
    <>
      {rows.length === 0 ? (
        <p className="empty">Aucune échéance proche sur la flotte.</p>
      ) : (
        <div className="card tbl-wrap overflow-x-auto!">
          <table className="tbl" aria-label="Échéances de la flotte">
            <thead>
              <tr>
                <th>Véhicule</th>
                <th>Échéance</th>
                <th>Date / seuil</th>
                <th>Situation</th>
                <th>Disponibilité</th>
                <th className="r">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ vehicle, deadline }) => {
                const blocked = blockReason(vehicle, today);
                return (
                  <tr key={`${vehicle.id}-${deadline.label}`}>
                    <td>
                      <div className="col gap-0.5">
                        <Link to={`/location/flotte/${vehicle.id}`} className="plate-tag w-fit">
                          {vehicle.plate}
                        </Link>
                        <span className="muted text-xs">{vehicleTitle(vehicle)}</span>
                      </div>
                    </td>
                    <td className="b">{deadline.label}</td>
                    <td className="num">{deadline.when}</td>
                    <td>
                      <span className={cn('badge', DEADLINE_BADGE[deadline.state])}>{deadline.text}</span>
                    </td>
                    <td>
                      {blocked ? (
                        <span className="badge dot s-bad" title={blocked}>
                          Bloqué
                        </span>
                      ) : (
                        <span className="badge dot s-ok">Disponible</span>
                      )}
                    </td>
                    <td className="r">
                      {deadline.label === 'Assurance' ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/location/flotte/${vehicle.id}`}>
                            <Upload /> Ajouter l’attestation
                          </Link>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={deadline.state === 'late' ? 'default' : 'outline'}
                          onClick={() => onBook(vehicle, deadline.label)}
                        >
                          {deadline.label === 'Vidange' ? <Wrench /> : <CalendarClock />} Prendre rendez-vous
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="alert s-blue">
        <Info className="i" />
        <span>
          Un véhicule de la flotte dont l’assurance ou le contrôle technique est expiré ne peut plus être
          choisi pour une location ou un prêt.
        </span>
      </div>
    </>
  );
}
