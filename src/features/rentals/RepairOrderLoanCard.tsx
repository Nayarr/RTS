import { Link } from 'react-router';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { rentalStatus, shortDateTime } from './rental-domain';
import { useRepairOrderLoans } from './rental-hooks';

/** Fiche OR : véhicule prêté au client pendant l'intervention, ou bouton pour en prêter un. */
export function RepairOrderLoanCard({
  repairOrderId,
  clientId,
  editable,
}: {
  repairOrderId: string;
  clientId: string | null;
  editable: boolean;
}) {
  const loans = useRepairOrderLoans(repairOrderId);
  const list = loans.data ?? [];
  const params = new URLSearchParams({
    type: 'pret',
    or: repairOrderId,
    ...(clientId ? { client: clientId } : {}),
  });

  return (
    <section data-slot="card" className="card" aria-labelledby="or-loan">
      <div className="card-h">
        <h2 className="h2" id="or-loan">
          <KeyRound className="i s text-muted-foreground" /> Véhicule de prêt
        </h2>
        {editable && (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/location/nouvelle?${params.toString()}`}>Prêter un véhicule</Link>
          </Button>
        )}
      </div>
      {loans.isSuccess && list.length === 0 && (
        <p className="card-b hint">Aucun véhicule prêté au client pendant cette intervention.</p>
      )}
      {list.length > 0 && (
        <ul>
          {list.map((loan) => {
            const state = rentalStatus(loan);
            return (
              <li key={loan.id}>
                <Link to={`/location/contrats/${loan.id}`} className="li hover:bg-hover">
                  <span className="c2 min-w-0">
                    <b>
                      {loan.number} · {loan.plate}
                    </b>
                    <span>
                      {loan.brand} {loan.model} · retour prévu {shortDateTime(loan.planned_return_at)}
                      {loan.billable ? '' : ' · gratuit'}
                    </span>
                  </span>
                  <span className={cn('badge', state.tone)}>{state.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
