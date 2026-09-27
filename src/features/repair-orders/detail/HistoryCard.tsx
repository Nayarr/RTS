import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '../constants';
import { useRepairOrderEvents } from '../hooks';

/** Historique de l'OR (création, statuts, technicien, badgeage…), du plus récent au plus ancien. */
export function HistoryCard({ repairOrderId }: { repairOrderId: string }) {
  const events = useRepairOrderEvents(repairOrderId, true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Historique</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
        <ol className="max-h-72 divide-y overflow-y-auto">
          {(events.data ?? []).map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm"
            >
              <span>
                {event.label}
                {event.actor_name && <span className="text-muted-foreground"> — {event.actor_name}</span>}
              </span>
              <time className="text-xs whitespace-nowrap text-muted-foreground" dateTime={event.created_at}>
                {formatDateTime(event.created_at)}
              </time>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
