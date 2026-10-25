import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchArchives, setClientArchived, setVehicleArchived } from '@/features/customers/api';
import { clientsKey, useCustomerMutation } from '@/features/customers/hooks';
import { formatDate } from '@/features/repair-orders/constants';

/** Réglages › Archives : clients et véhicules archivés, à rouvrir ou restaurer. */
export function ArchivesPanel() {
  const archives = useQuery({ queryKey: [...clientsKey, 'archives'], queryFn: fetchArchives });
  const restoreClient = useCustomerMutation((id: string) => setClientArchived(id, false), 'Client restauré');
  const restoreVehicle = useCustomerMutation(
    (id: string) => setVehicleArchived(id, false),
    'Véhicule restauré',
  );

  if (archives.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (archives.isError) return <p className="text-destructive">Impossible de charger les archives.</p>;
  const { clients, vehicles } = archives.data;
  return (
    <>
      <section data-slot="card" className="card" aria-labelledby="archived-clients">
        <div className="card-h">
          <h2 className="h2" id="archived-clients">
            Clients archivés
          </h2>
          <span className="cnt">{clients.length}</span>
        </div>
        <p className="card-b hint">
          Hors des listes et de la recherche ; OR, devis et factures restent. Un client restauré revient avec
          ses véhicules archivés en même temps que lui.
        </p>
        {clients.length === 0 ? (
          <p className="card-b hint">Aucun client archivé.</p>
        ) : (
          <ul>
            {clients.map((client) => (
              <li key={client.id} className="row between gap-3 border-t px-6 py-2.5">
                <Link to={`/clients/${client.id}`} className="c2 min-w-0">
                  <b>{client.name}</b>
                  <span>
                    Archivé le {formatDate(client.archived_at)} · {client.vehicles_count} véhicule
                    {client.vehicles_count > 1 ? 's' : ''}
                  </span>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restoreClient.isPending}
                  onClick={() => restoreClient.mutate(client.id)}
                  aria-label={`Restaurer ${client.name}`}
                >
                  <ArchiveRestore /> Restaurer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section data-slot="card" className="card" aria-labelledby="archived-vehicles">
        <div className="card-h">
          <h2 className="h2" id="archived-vehicles">
            Véhicules archivés
          </h2>
          <span className="cnt">{vehicles.length}</span>
        </div>
        {vehicles.length === 0 ? (
          <p className="card-b hint">Aucun véhicule archivé.</p>
        ) : (
          <ul>
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className="row between gap-3 border-t px-6 py-2.5">
                <Link to={`/vehicules/${vehicle.id}`} className="c2 min-w-0">
                  <b>
                    <span className="plate">{vehicle.plate}</span>{' '}
                    {[vehicle.brand, vehicle.model].filter(Boolean).join(' ')}
                  </b>
                  <span>
                    {vehicle.client_name ?? 'Sans client'} · archivé le {formatDate(vehicle.archived_at)}
                  </span>
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restoreVehicle.isPending}
                  onClick={() => restoreVehicle.mutate(vehicle.id)}
                  aria-label={`Restaurer ${vehicle.plate}`}
                >
                  <ArchiveRestore /> Restaurer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
