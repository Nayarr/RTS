import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { CalendarClock, FileSignature, Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
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

  const active = (contracts.data ?? []).length - ended;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Clients et véhicules' }, { label: 'Contrats' }]}
        title="Contrats d’entretien"
        actions={
          <Button onClick={() => setDialog({ kind: 'contract', contract: null })}>
            <Plus /> Nouveau contrat
          </Button>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CustomersTabs />
          <div className="seg" role="group" aria-label="Contrats affichés">
            <button
              type="button"
              className={cn(!showEnded && 'on')}
              aria-pressed={!showEnded}
              onClick={() => setShowEnded(false)}
            >
              En cours <span className="n">{active}</span>
            </button>
            <button
              type="button"
              className={cn(showEnded && 'on')}
              aria-pressed={showEnded}
              onClick={() => setShowEnded(true)}
            >
              Terminés <span className="n">{ended}</span>
            </button>
          </div>
        </div>

        {contracts.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {contracts.isError && <p className="text-destructive">Impossible de charger les contrats.</p>}

        <ul className="grid items-start gap-4 lg:grid-cols-2">
          {list.map((contract) => {
            const due = contract.vehicles.filter((vehicle) => vehicleServiceState(vehicle) === 'due').length;
            return (
              <li key={contract.id}>
                <article
                  aria-label={`${contract.client_name} — ${contract.service_description || 'Entretien'}`}
                  className="card overflow-hidden"
                >
                  <div className="card-h items-start">
                    <div className="col gap-0.5">
                      <button
                        type="button"
                        className="h2 ul cursor-pointer text-left"
                        onClick={() => setDialog({ kind: 'contract', contract })}
                      >
                        {contract.client_name} — {contract.service_description || 'Entretien'}
                      </button>
                      <span className="hint">
                        {contractTerms(contract)}
                        {contract.is_active
                          ? ` · depuis le ${formatDate(contract.starts_on)}`
                          : ` · terminé le ${formatDate(contract.ended_on)}`}
                      </span>
                    </div>
                    {contract.is_active && contract.monthly_price_ht ? (
                      <Button
                        variant="outline"
                        size="sm"
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

                  <ul>
                    {contract.vehicles.map((vehicle) => {
                      const state = vehicleServiceState(vehicle);
                      return (
                        <li
                          key={vehicle.vehicle_id}
                          className="row gap-3 border-b px-5 py-2.5 last:border-b-0"
                        >
                          <Link to={`/vehicules/${vehicle.vehicle_id}`} className="plate">
                            {vehicle.plate}
                          </Link>
                          <span className="muted grow text-[13px]">
                            {contract.is_active && (
                              <>
                                dernier entretien :{' '}
                                {vehicle.last_service_at ? formatDate(vehicle.last_service_at) : 'aucun'}
                                {vehicle.km_since_service !== null && vehicle.km_since_service !== undefined
                                  ? ` (+${vehicle.km_since_service.toLocaleString('fr-FR')} km)`
                                  : ''}
                              </>
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
                              <span className={cn('badge', state === 'planned' ? 's-grey' : 's-ok')}>
                                {state === 'planned' ? 'RDV planifié' : 'À jour'}
                              </span>
                            ))}
                        </li>
                      );
                    })}
                  </ul>
                  {due > 0 && (
                    <p className="warn-t b border-t bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-5 py-2.5">
                      {due} entretien{due > 1 ? 's' : ''} à planifier
                    </p>
                  )}
                </article>
              </li>
            );
          })}
          {contracts.isSuccess && !showEnded && (
            <li className="empty col items-center gap-2.5 p-8">
              <FileSignature className="i l" />
              <span>Crée un contrat pour suivre automatiquement l’entretien des véhicules d’un client.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog({ kind: 'contract', contract: null })}
              >
                Nouveau contrat
              </Button>
            </li>
          )}
          {contracts.isSuccess && showEnded && list.length === 0 && (
            <li className="empty">Aucun contrat terminé.</li>
          )}
        </ul>

        {ended > 0 && (
          <button
            type="button"
            className="link cursor-pointer self-start text-[13.5px]"
            onClick={() => setShowEnded((value) => !value)}
          >
            {showEnded ? 'Voir les contrats en cours' : `Voir les contrats terminés (${ended})`}
          </button>
        )}
      </div>

      {dialog?.kind === 'contract' && (
        <ContractDialog contract={dialog.contract} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'appointment' && (
        <AppointmentDialog appointment={null} preset={dialog.preset} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
