import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarClock, Plus, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomersTabs } from '@/features/customers/CustomersTabs';
import { AppointmentDialog } from '@/features/planning/AppointmentDialog';
import type { AppointmentPreset } from '@/features/planning/schemas';
import { formatDate } from '@/features/repair-orders/constants';
import { cn } from '@/lib/utils';
import { buildContractInvoice, type Contract } from './api';
import { ContractDialog } from './ContractDialog';
import { contractTerms, serviceAppointmentPreset, vehicleServiceState } from './domain';
import { useContractMutation, useContracts } from './hooks';

type OpenDialog =
  { kind: 'contract'; contract: Contract | null } | { kind: 'appointment'; preset: AppointmentPreset };

/** Contrats d'entretien : entretiens à planifier, facturation mensuelle. */
export function ContractsPage() {
  const contracts = useContracts();
  const navigate = useNavigate();
  const [showEnded, setShowEnded] = useState(false);
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const bill = useContractMutation((id: string) => buildContractInvoice(id), 'Facture du mois préparée');

  const list = (contracts.data ?? []).filter((contract) => contract.is_active !== showEnded);
  const ended = (contracts.data ?? []).filter((contract) => !contract.is_active).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Clients et véhicules</h1>
          <p className="text-muted-foreground">
            Fiches clients, historique, impayés et échéances des véhicules.
          </p>
        </div>
        <Button size="lg" onClick={() => setDialog({ kind: 'contract', contract: null })}>
          <Plus /> Nouveau contrat
        </Button>
      </div>
      <CustomersTabs />

      {ended > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowEnded((value) => !value)}>
          {showEnded ? 'Voir les contrats en cours' : `Voir les contrats terminés (${ended})`}
        </Button>
      )}

      {contracts.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {contracts.isError && <p className="text-destructive">Impossible de charger les contrats.</p>}
      {contracts.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {showEnded
            ? 'Aucun contrat terminé.'
            : 'Aucun contrat. Crée un contrat pour suivre automatiquement l’entretien des véhicules d’un client.'}
        </p>
      )}

      <ul className="space-y-3">
        {list.map((contract) => {
          const due = contract.vehicles.filter((vehicle) => vehicleServiceState(vehicle) === 'due').length;
          return (
            <li key={contract.id}>
              <article
                aria-label={`${contract.client_name} — ${contract.service_description || 'Entretien'}`}
                className="space-y-3 rounded-lg border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <button
                      type="button"
                      className="text-left font-bold hover:underline"
                      onClick={() => setDialog({ kind: 'contract', contract })}
                    >
                      {contract.client_name} — {contract.service_description || 'Entretien'}
                    </button>
                    <p className="text-sm text-muted-foreground">
                      {contractTerms(contract)}
                      {contract.is_active
                        ? ` — depuis le ${formatDate(contract.starts_on)}`
                        : ` — terminé le ${formatDate(contract.ended_on)}`}
                    </p>
                  </div>
                  {contract.is_active && contract.monthly_price_ht ? (
                    <Button
                      variant="outline"
                      disabled={bill.isPending}
                      onClick={() =>
                        bill.mutate(contract.id, {
                          onSuccess: (invoiceId) => void navigate(`/factures/${invoiceId}`),
                        })
                      }
                    >
                      <Receipt /> Facturer le mois
                    </Button>
                  ) : null}
                </div>

                <ul className="divide-y rounded-md border">
                  {contract.vehicles.map((vehicle) => {
                    const state = vehicleServiceState(vehicle);
                    return (
                      <li
                        key={vehicle.vehicle_id}
                        className="flex flex-wrap items-center justify-between gap-2 p-2"
                      >
                        <span className="text-sm">
                          <Link
                            to={`/vehicules/${vehicle.vehicle_id}`}
                            className="font-semibold hover:underline"
                          >
                            {vehicle.plate}
                          </Link>
                          {contract.is_active && (
                            <span className="text-muted-foreground">
                              {' '}
                              — dernier entretien :{' '}
                              {vehicle.last_service_at ? formatDate(vehicle.last_service_at) : 'aucun'}
                              {vehicle.km_since_service !== null && vehicle.km_since_service !== undefined
                                ? ` (+${vehicle.km_since_service.toLocaleString('fr-FR')} km)`
                                : ''}
                            </span>
                          )}
                        </span>
                        {contract.is_active &&
                          (state === 'due' ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                setDialog({
                                  kind: 'appointment',
                                  preset: serviceAppointmentPreset(contract, vehicle),
                                })
                              }
                            >
                              <CalendarClock /> À planifier
                            </Button>
                          ) : (
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                state === 'planned' ? 'text-muted-foreground' : 'text-emerald-700',
                              )}
                            >
                              {state === 'planned' ? 'RDV planifié' : 'À jour'}
                            </span>
                          ))}
                      </li>
                    );
                  })}
                </ul>
                {due > 0 && (
                  <p className="text-sm font-semibold text-amber-700">
                    {due} entretien{due > 1 ? 's' : ''} à planifier
                  </p>
                )}
              </article>
            </li>
          );
        })}
      </ul>

      {dialog?.kind === 'contract' && (
        <ContractDialog contract={dialog.contract} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'appointment' && (
        <AppointmentDialog appointment={null} preset={dialog.preset} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
