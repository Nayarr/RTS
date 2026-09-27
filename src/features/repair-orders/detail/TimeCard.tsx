import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RepairOrderOverview } from '../api';
import { formatDuration, formatHours } from '../constants';
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
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Temps passé</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-sm text-muted-foreground">Badgé (chrono)</p>
            <p className="font-display text-2xl font-bold tabular-nums">
              {order.running_since && <span className="mr-1.5 animate-pulse text-warning">●</span>}
              {formatDuration(seconds)}
            </p>
          </div>
          {showComparison && (
            <>
              <div>
                <p className="text-sm text-muted-foreground">Déclaré (travaux effectués)</p>
                <p className="font-display text-2xl font-bold">{formatHours(order.declared_hours)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Écart</p>
                <p
                  className={`font-display text-2xl font-bold ${favorable ? 'text-success' : 'text-destructive'}`}
                >
                  {delta >= 0 ? '+' : ''}
                  {delta.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h
                </p>
              </div>
            </>
          )}
        </div>
        {showComparison && order.declared_hours > 0 && (
          <p className={`text-sm ${favorable ? 'text-success' : 'text-destructive'}`}>
            {favorable
              ? 'Temps passé inférieur ou égal au temps déclaré / facturé.'
              : 'Le technicien a passé plus de temps que ce qui est déclaré / facturé.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
