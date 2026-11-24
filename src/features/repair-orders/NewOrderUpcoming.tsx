import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Check, ClipboardCheck, Droplet, Plus } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { todayIso } from './schemas';
import { taskLines } from './tasks';
import {
  deadlineRows,
  mileageValue,
  UPCOMING_LABELS,
  type DeadlineState,
  type DeclaredOil,
  type UpcomingInput,
} from './upcoming-work';
import { fetchUpcomingInput } from './upcoming-work-api';

const BADGES: Record<DeadlineState, { text: string; className: string }> = {
  ok: { text: 'OK', className: 's-ok' },
  due: { text: 'À proposer', className: 's-bad' },
  planned: { text: 'Prévu', className: 's-blue' },
  unknown: { text: 'Non renseigné', className: 's-grey' },
};

/**
 * Création d'OR : toutes les échéances du véhicule (contrôle technique, hayon, antipollution,
 * extincteurs, vidange) avec leur état ; « Ajouter aux prévus » sur celles à proposer ou sans donnée.
 * La vidange se recalcule sur le kilométrage saisi. Sans vidange connue, la dernière dite par le client.
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
  const rows = input
    ? deadlineRows(
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
  const due = rows.filter((row) => row.state === 'due').length;
  // Dernière vidange à demander : nouveau véhicule, ou véhicule sans vidange connue (pas une remorque)
  const askOil = vehicleType !== 'remorque' && (!vehicleId || (input !== undefined && !hasOilChange(input)));

  if (!rows.length && !askOil) return null;

  return (
    <section data-slot="card" className="card" aria-labelledby="new-ro-upcoming">
      <div className="card-h">
        <h2 className="h2" id="new-ro-upcoming">
          <CalendarClock className="i" /> Échéances du véhicule
        </h2>
        {rows.length > 0 && (
          <span className={`badge ${due ? 's-bad' : 's-ok'}`} role="status">
            {due ? `${due} à proposer` : 'Rien à proposer'}
          </span>
        )}
      </div>
      <div className="card-b col gap-3">
        {rows.length > 0 && (
          <p className="hint">
            Toutes les échéances connues du véhicule. La vidange se recalcule à chaque saisie du kilométrage.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="col" aria-label="Échéances du véhicule">
            {rows.map((row) => {
              const badge = BADGES[row.state];
              return (
                <li
                  key={row.kind}
                  className="row top gap-2.5 border-t py-2.5 first:border-t-0 first:pt-0"
                  aria-label={`${row.label} : ${badge.text}`}
                >
                  <div className="col min-w-0 flex-1 gap-0.5">
                    <b>{row.label}</b>
                    {row.detail.map((line) => (
                      <span key={line} className="hint">
                        {line.charAt(0).toUpperCase() + line.slice(1)}
                      </span>
                    ))}
                  </div>
                  <span className={`badge ${badge.className} shrink-0`}>
                    {row.state === 'ok' && <Check className="size-3" />}
                    {row.state === 'planned' && <ClipboardCheck className="size-3" />}
                    {badge.text}
                  </span>
                  {(row.state === 'due' || row.state === 'unknown') && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      aria-label={`Ajouter aux prévus : ${row.label}`}
                      onClick={() => onAddTask(UPCOMING_LABELS[row.kind])}
                    >
                      <Plus /> Ajouter aux prévus
                    </Button>
                  )}
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
