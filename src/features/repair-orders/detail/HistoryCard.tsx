import { formatDateTime } from '../constants';
import { useRepairOrderEvents } from '../hooks';

/** Couleur de la pastille selon l'événement (maquette : terminé, chrono, message, le reste). */
function eventTone(label: string) {
  const text = label.toLowerCase();
  if (text.includes('termin') || text.includes('factur')) return 's-done';
  if (text.includes('chrono') || text.includes('badg') || text.includes('en cours')) return 's-progress';
  if (text.includes('message') || text.includes('envoy') || text.includes('devis')) return 's-blue';
  return 's-grey';
}

/** Historique de l'OR (création, statuts, technicien, badgeage…), du plus récent au plus ancien. */
export function HistoryCard({ repairOrderId }: { repairOrderId: string }) {
  const events = useRepairOrderEvents(repairOrderId, true);

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-history">
      <div className="card-h">
        <h2 className="h2" id="ro-history">
          Historique
        </h2>
      </div>
      {events.isPending && <p className="card-b hint">Chargement…</p>}
      <ol className="card-b col max-h-96 gap-3.5 overflow-y-auto">
        {(events.data ?? []).map((event) => (
          <li key={event.id} className="row top gap-2.5">
            <span className={`tdot mt-[5px] ${eventTone(event.label)}`} />
            <div className="col gap-0">
              <span>{event.label}</span>
              <span className="hint">
                {event.actor_name && `${event.actor_name} · `}
                <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
