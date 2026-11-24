import { useQuery } from '@tanstack/react-query';
import { History, ImageIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useFileUrls } from '@/features/files/hooks';
import { formatDate } from '@/features/repair-orders/constants';
import { RENEWAL_LABELS, renewalDueLabel } from '@/features/workshop/domain';
import { fetchVehicleRenewals } from './api';

/**
 * Historique des échéances de la fiche véhicule : chaque renouvellement validé à l'atelier
 * (ancienne et nouvelle date, OR, auteur) avec la photo de la nouvelle étiquette.
 */
export function DeadlineRenewalsCard({ vehicleId }: { vehicleId: string }) {
  const renewals = useQuery({
    queryKey: ['vehicles', vehicleId, 'renewals'],
    queryFn: () => fetchVehicleRenewals(vehicleId),
  });
  const list = renewals.data ?? [];
  const urls = useFileUrls(list.map((renewal) => renewal.file_id));
  if (!list.length) return null;

  return (
    <section data-slot="card" className="card" aria-labelledby="vehicle-renewals">
      <div className="card-h">
        <h2 className="h2" id="vehicle-renewals">
          <History className="i" /> Historique des échéances
        </h2>
        <span className="cnt">{list.length}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl dense">
          <thead>
            <tr>
              <th>Date</th>
              <th>Échéance</th>
              <th>Avant</th>
              <th>Après</th>
              <th>OR</th>
              <th>Par</th>
              <th>Photo</th>
            </tr>
          </thead>
          <tbody>
            {list.map((renewal) => {
              const url = renewal.file_id ? urls.data?.[renewal.file_id] : undefined;
              return (
                <tr key={renewal.id}>
                  <td className="num">{formatDate(renewal.created_at)}</td>
                  <td className="whitespace-nowrap">{RENEWAL_LABELS[renewal.kind]}</td>
                  <td className="num muted">
                    {renewal.previous_due ? renewalDueLabel(renewal.kind, renewal.previous_due) : '-'}
                  </td>
                  <td className="num font-semibold text-success">
                    {renewalDueLabel(renewal.kind, renewal.new_due)}
                  </td>
                  <td>
                    {renewal.repair_order_id && renewal.repair_orders ? (
                      <Link className="b ul" to={`/or/${renewal.repair_order_id}`}>
                        {renewal.repair_orders.number}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="whitespace-nowrap">{renewal.profiles?.full_name ?? '-'}</td>
                  <td>
                    {url ? (
                      <a
                        className="ibtn"
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Photo de la nouvelle étiquette : ${RENEWAL_LABELS[renewal.kind]}`}
                      >
                        <ImageIcon className="size-4" />
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
