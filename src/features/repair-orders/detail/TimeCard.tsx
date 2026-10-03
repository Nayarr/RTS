import type { RepairOrderOverview } from '../api';
import { formatShortDuration } from '../constants';
import { useLiveSeconds } from '../use-live-seconds';

/** Temps passé ; comparatif badgé / déclaré pour la direction (comme l'ancienne appli). */
export function TimeCard({
  order,
  loadedAt,
  showComparison,
}: {
  order: RepairOrderOverview;
  /** Heure du chargement des données (ms). */
  loadedAt: number;
  showComparison: boolean;
}) {
  const seconds = useLiveSeconds(order.worked_seconds, order.running_since, loadedAt);
  const workedHours = seconds / 3600;
  const delta = workedHours - order.declared_hours;
  const favorable = delta <= 0;

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-time">
      <div className="card-h">
        <h2 className="h2" id="ro-time">
          Temps passé
        </h2>
      </div>
      <div className="card-b col gap-3">
        <div className="g3 gap-2.5">
          <div className="col gap-0.5">
            <span className="hint">Badgé (chrono)</span>
            <span className="kpi-v text-2xl">
              {order.running_since && <span className="warn-t animate-pulse text-lg">●</span>}
              {formatShortDuration(seconds)}
            </span>
          </div>
          {showComparison && (
            <>
              <div className="col gap-0.5">
                <span className="hint">Déclaré</span>
                <span className="kpi-v text-2xl">{formatShortDuration(order.declared_hours * 3600)}</span>
              </div>
              <div className="col gap-0.5">
                <span className="hint">Écart</span>
                <span className={`kpi-v text-2xl ${favorable ? 'up' : 'down'}`}>
                  {delta >= 0 ? '+' : '−'}
                  {formatShortDuration(Math.abs(delta) * 3600)}
                </span>
              </div>
            </>
          )}
        </div>
        {showComparison && order.declared_hours > 0 && (
          <p className={`text-[13px] ${favorable ? 'up' : 'down'}`}>
            {favorable
              ? 'Temps passé inférieur ou égal au temps déclaré / facturé.'
              : 'Le technicien a passé plus de temps que ce qui est déclaré / facturé.'}
          </p>
        )}
      </div>
    </section>
  );
}
