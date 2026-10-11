import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { AttendanceTabs } from '@/features/attendance/AttendanceTabs';
import { useActiveTechnicians } from '@/features/repair-orders/hooks';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { decideLeaveRequest, deleteLeaveRequest, type LeaveRequest } from './api';
import { LEAVE_LABELS, LEAVE_STATUS_META, leaveDays, leaveHours, leavePeriod } from './domain';
import { useLeaveMutation, useLeaveRequests } from './hooks';
import { LeaveDialog } from './LeaveDialog';

const HISTORY_LIMIT = 60;

/** Congés et absences (direction) : demandes à traiter, absences saisies, historique. */
export function LeavePage() {
  const leaves = useLeaveRequests();
  const technicians = useActiveTechnicians();
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<LeaveRequest | null>(null);
  const decide = useLeaveMutation(
    ({ id, approve }: { id: string; approve: boolean }) => decideLeaveRequest(id, approve),
    'Demande traitée',
  );
  const remove = useLeaveMutation((id: string) => deleteLeaveRequest(id), 'Absence supprimée');

  const today = todayIso();
  const [period, setPeriod] = useState<'upcoming' | 'past'>('upcoming');
  const requests = (leaves.data ?? []).filter((leave) => leave.status === 'requested');
  const history = (leaves.data ?? [])
    .filter((leave) => leave.status !== 'requested')
    .filter((leave) => (period === 'upcoming' ? leave.ends_on >= today : leave.ends_on < today))
    .slice(0, HISTORY_LIMIT);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Équipe' }, { label: 'Congés et absences' }]}
        title="Congés et absences"
        actions={
          <Button disabled={!technicians.data?.length} onClick={() => setAdding(true)}>
            <Plus /> Ajouter une absence
          </Button>
        }
      />

      <div className="col gap-4">
        <div className="toolbar">
          <AttendanceTabs leaveRequests={requests.length || undefined} />
        </div>

        {leaves.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {leaves.isError && <p className="text-destructive">Impossible de charger les absences.</p>}

        {leaves.data && (
          <>
            <section
              data-slot="card"
              className="card"
              aria-label={`Demandes à traiter (${requests.length})`}
              style={
                requests.length
                  ? { borderColor: 'color-mix(in srgb, var(--warning) 45%, transparent)' }
                  : undefined
              }
            >
              <div className="card-h">
                <h2 className="h2">Demandes à traiter</h2>
                <span className={cn('cnt', requests.length > 0 && 'bg-warning! text-white!')}>
                  {requests.length}
                </span>
              </div>
              {requests.length ? (
                <ul>
                  {requests.map((leave) => (
                    <li key={leave.id}>
                      <article
                        aria-label={`${leave.technician_name} · ${LEAVE_LABELS[leave.leave_type]}`}
                        className="li flex-wrap"
                      >
                        <span className="who">
                          <span className="av">{initials(leave.technician_name ?? '')}</span>
                          <span className="c2">
                            <b>{leave.technician_name}</b>
                            <span className="badge s-warn h-5 px-2 text-[11px]!">En attente</span>
                          </span>
                        </span>
                        <span className="col gap-0.5">
                          <b>{LEAVE_LABELS[leave.leave_type]}</b>
                          <span className="hint">
                            {leavePeriod(leave.starts_on, leave.ends_on, leave.start_time, leave.end_time)}
                            {leave.comment ? ` · ${leave.comment}` : ''}
                          </span>
                        </span>
                        <span className="row gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: leave.id, approve: false })}
                          >
                            Refuser
                          </Button>
                          <Button
                            size="sm"
                            disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: leave.id, approve: true })}
                          >
                            <Check /> Valider
                          </Button>
                        </span>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="card-b hint">Aucune demande en attente.</p>
              )}
            </section>

            <section data-slot="card" className="card tbl-wrap" aria-label="Historique">
              <div className="card-h">
                <h2 className="h2">Absences</h2>
                <div className="seg" role="group" aria-label="Période">
                  <button
                    type="button"
                    className={cn(period === 'upcoming' && 'on')}
                    aria-pressed={period === 'upcoming'}
                    onClick={() => setPeriod('upcoming')}
                  >
                    À venir
                  </button>
                  <button
                    type="button"
                    className={cn(period === 'past' && 'on')}
                    aria-pressed={period === 'past'}
                    onClick={() => setPeriod('past')}
                  >
                    Passées
                  </button>
                </div>
              </div>
              {history.length ? (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Technicien</th>
                        <th>Type</th>
                        <th>Période</th>
                        <th className="r">Jours</th>
                        <th>Statut</th>
                        <th className="w-12">
                          <span className="sr-only">Supprimer</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((leave) => {
                        const meta = LEAVE_STATUS_META[leave.status];
                        return (
                          <tr
                            key={leave.id}
                            aria-label={`${leave.technician_name} · ${LEAVE_LABELS[leave.leave_type]}`}
                          >
                            <td>
                              <span className="who">
                                <span className="av sm">{initials(leave.technician_name ?? '')}</span>
                                <b>{leave.technician_name}</b>
                              </span>
                            </td>
                            <td>
                              <span className="c2">
                                <span className="text-[13.5px]! text-foreground!">
                                  {LEAVE_LABELS[leave.leave_type]}
                                </span>
                                {leave.comment && <span>{leave.comment}</span>}
                              </span>
                            </td>
                            <td className="num">
                              {leavePeriod(
                                leave.starts_on,
                                leave.ends_on,
                                leave.start_time,
                                leave.end_time,
                              ).replace(/ \([\d,]+ [jh]\)$/, '')}
                            </td>
                            <td className="r num">
                              {leave.start_time && leave.end_time
                                ? `${leaveHours(leave.start_time, leave.end_time).toLocaleString('fr-FR')} h`
                                : leaveDays(leave.starts_on, leave.ends_on)}
                            </td>
                            <td>
                              <span className={cn('badge', meta.badge)}>{meta.label}</span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="ibtn sm ghost text-destructive"
                                aria-label="Supprimer"
                                onClick={() => setToDelete(leave)}
                              >
                                <Trash2 className="i s" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="card-b hint">Aucune absence {period === 'upcoming' ? 'à venir' : 'passée'}.</p>
              )}
            </section>
          </>
        )}
      </div>

      {adding && technicians.data && (
        <LeaveDialog technicians={technicians.data} onClose={() => setAdding(false)} />
      )}
      {toDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setToDelete(null)}
          title="Supprimer cette absence ?"
          description={`${toDelete.technician_name} · ${LEAVE_LABELS[toDelete.leave_type]} ${leavePeriod(toDelete.starts_on, toDelete.ends_on, toDelete.start_time, toDelete.end_time)}.`}
          confirmLabel="Supprimer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        />
      )}
    </>
  );
}
