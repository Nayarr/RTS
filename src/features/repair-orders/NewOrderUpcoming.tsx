import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Droplet, Plus } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { todayIso } from './schemas';
import { taskLines } from './tasks';
import {
  mileageValue,
  upcomingWork,
  UPCOMING_LABELS,
  type DeclaredOil,
  type UpcomingInput,
  type UpcomingItem,
} from './upcoming-work';
import { fetchUpcomingInput } from './upcoming-work-api';

const badge = (item: UpcomingItem) => {
  if (item.days === null) return null;
  if (item.days < 0) return { text: 'Dépassé', className: 's-bad' };
  return { text: `Dans ${item.days} j`, className: 's-warn' };
};

/**
 * Création d'OR : ce qui arrive à échéance sur le véhicule (contrôle technique, hayon, extincteurs,
 * vidange), avec « Ajouter aux tâches » ; et, sans vidange connue, la dernière vidange dite par le client.
 */
export function NewOrderUpcoming({
  vehicleId,
  vehicleType,
  mileage,
  requestedWork,
  declaredOil,
  onDeclaredOilChange,
  onAddTask,
}: {
  /** Véhicule déjà en base, sinon null (nouveau véhicule). */
  vehicleId: string | null;
  vehicleType: string;
  mileage: string;
  requestedWork: string;
  declaredOil: DeclaredOil;
  onDeclaredOilChange: (value: DeclaredOil) => void;
  onAddTask: (task: string) => void;
}) {
  const known = useQuery({
    queryKey: ['vehicles', vehicleId, 'upcoming-input'],
    queryFn: () => fetchUpcomingInput({ vehicleId: vehicleId!, vehicleType, mileage: null }),
    enabled: Boolean(vehicleId),
  });
  const declared = declaredOil.date
    ? [{ date: declaredOil.date, mileage: mileageValue(declaredOil.mileage) }]
    : [];
  const input = known.data;
  const items = input
    ? upcomingWork(
        {
          ...input,
          vehicleType,
          mileage: mileageValue(mileage),
          currentLines: taskLines(requestedWork),
          oilChanges: [...input.oilChanges, ...declared],
        },
        todayIso(),
      )
    : [];
  // Dernière vidange à demander : nouveau véhicule, ou véhicule sans vidange connue (pas une remorque)
  const askOil = vehicleType !== 'remorque' && (!vehicleId || (input !== undefined && !hasOilChange(input)));

  if (!items.length && !askOil) return null;

  return (
    <section data-slot="card" className="card" aria-labelledby="new-ro-upcoming">
      <div className="card-h">
        <h2 className="h2" id="new-ro-upcoming">
          <CalendarClock className="i" /> Échéances du véhicule
        </h2>
      </div>
      <div className="card-b col gap-3">
        {items.length > 0 && (
          <ul className="col gap-2" aria-label="Échéances à proposer">
            {items.map((item) => {
              const status = badge(item);
              return (
                <li key={item.kind} className="row top gap-2.5">
                  <div className="col min-w-0 flex-1 gap-0.5">
                    <span className="row flex-wrap gap-2">
                      <b>{item.label}</b>
                      {status && <span className={`badge ${status.className}`}>{status.text}</span>}
                    </span>
                    <span className="hint">{item.detail}</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Ajouter aux tâches : ${item.label}`}
                    onClick={() => onAddTask(UPCOMING_LABELS[item.kind])}
                  >
                    <Plus /> Ajouter aux tâches
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {askOil && (
          <fieldset className="col gap-2">
            <legend className="row mb-1 gap-1.5 font-semibold">
              <Droplet className="i xs" /> Dernière vidange (facultatif)
            </legend>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <FormField
                id="declared-oil-date"
                label="Date de la vidange"
                type="date"
                max={todayIso()}
                value={declaredOil.date}
                onChange={(event) => onDeclaredOilChange({ ...declaredOil, date: event.target.value })}
              />
              <FormField
                id="declared-oil-mileage"
                label="Kilométrage de la vidange (facultatif)"
                inputMode="numeric"
                className="num"
                disabled={!declaredOil.date}
                value={declaredOil.mileage}
                onChange={(event) => onDeclaredOilChange({ ...declaredOil, mileage: event.target.value })}
              />
            </div>
            <p className="hint">Dite par le client : notée dans l’historique de la fiche du véhicule.</p>
          </fieldset>
        )}
      </div>
    </section>
  );
}

/** Une vidange est-elle déjà connue (atelier ou déclarée) ? */
function hasOilChange(input: UpcomingInput) {
  return (
    input.oilChanges.length > 0 ||
    input.history.some((visit) => visit.lines.some((line) => /vidange/i.test(line)))
  );
}
