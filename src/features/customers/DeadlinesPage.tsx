import { Link } from 'react-router';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { CustomersTabs } from './CustomersTabs';
import { DEADLINE_LABELS, DEADLINE_TONE_CLASS, deadlineStatus, type DeadlineKind } from './domain';
import { useDeadlines } from './hooks';

const frenchDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Échéances véhicules dépassées ou dans les 30 jours (comme l'ancienne appli). */
export function DeadlinesPage() {
  const deadlines = useDeadlines();
  const today = todayIso();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Clients et véhicules</h1>
        <p className="text-muted-foreground">
          Fiches clients, historique, impayés et échéances des véhicules.
        </p>
      </div>
      <CustomersTabs />
      <p className="text-sm text-muted-foreground">
        Contrôles techniques et contrôles hayon dépassés ou dans les 30 prochains jours. Les dates se
        renseignent sur la fiche du véhicule (ou par le technicien depuis l’OR).
      </p>

      {deadlines.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {deadlines.isError && <p className="text-destructive">Impossible de charger les échéances.</p>}
      {deadlines.isSuccess && deadlines.data.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucune échéance proche. 👍
        </p>
      )}

      <ul className="space-y-2">
        {(deadlines.data ?? []).map((deadline) => {
          const status = deadlineStatus(deadline.due_date, today);
          const kind = (deadline.kind ?? 'ct') as DeadlineKind;
          return (
            <li key={`${deadline.vehicle_id}-${kind}`}>
              <Link
                to={`/vehicules/${deadline.vehicle_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 hover:bg-muted"
              >
                <span>
                  <strong className="tracking-wide">{deadline.plate}</strong>
                  <span className="block text-sm text-muted-foreground">
                    {DEADLINE_LABELS[kind]} — {deadline.due_date ? frenchDate(deadline.due_date) : '—'}
                    {deadline.client_name ? ` — ${deadline.client_name}` : ''}
                  </span>
                </span>
                {status && (
                  <span className={cn('font-semibold', DEADLINE_TONE_CLASS[status.tone])}>
                    {status.label}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
