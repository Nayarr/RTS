import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AttendanceTabs } from '@/features/attendance/AttendanceTabs';
import { useActiveTechnicians } from '@/features/repair-orders/hooks';
import { cn } from '@/lib/utils';
import { decideLeaveRequest, deleteLeaveRequest, type LeaveRequest } from './api';
import { LEAVE_LABELS, LEAVE_STATUS_META, leavePeriod } from './domain';
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

  const requests = (leaves.data ?? []).filter((leave) => leave.status === 'requested');
  const history = (leaves.data ?? []).filter((leave) => leave.status !== 'requested').slice(0, HISTORY_LIMIT);

  const card = (leave: LeaveRequest) => (
    <li key={leave.id}>
      <article
        aria-label={`${leave.technician_name} — ${LEAVE_LABELS[leave.leave_type]}`}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
      >
        <div>
          <strong>{leave.technician_name}</strong> — {LEAVE_LABELS[leave.leave_type]}
          <p className="text-sm text-muted-foreground">
            {leavePeriod(leave.starts_on, leave.ends_on)}
            {leave.comment ? ` — ${leave.comment}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(LEAVE_STATUS_META[leave.status].className)}>
            {LEAVE_STATUS_META[leave.status].label}
          </Badge>
          {leave.status === 'requested' ? (
            <>
              <Button
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: leave.id, approve: true })}
              >
                Valider
              </Button>
              <Button
                variant="outline"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ id: leave.id, approve: false })}
              >
                Refuser
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Supprimer" onClick={() => setToDelete(leave)}>
              <Trash2 />
            </Button>
          )}
        </div>
      </article>
    </li>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Congés et absences</h1>
          <p className="text-muted-foreground">
            Demandes des techniciens et absences saisies par la direction.
          </p>
        </div>
        <Button size="lg" disabled={!technicians.data?.length} onClick={() => setAdding(true)}>
          <Plus /> Ajouter une absence
        </Button>
      </div>
      <AttendanceTabs />

      {leaves.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {leaves.isError && <p className="text-destructive">Impossible de charger les absences.</p>}

      {leaves.data && (
        <>
          <section aria-labelledby="leave-requests" className="space-y-3">
            <h2 id="leave-requests" className="text-lg font-bold">
              Demandes à traiter ({requests.length})
            </h2>
            {requests.length ? (
              <ul className="space-y-2">{requests.map(card)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
            )}
          </section>
          <section aria-labelledby="leave-history" className="space-y-3">
            <h2 id="leave-history" className="text-lg font-bold">
              Historique
            </h2>
            {history.length ? (
              <ul className="space-y-2">{history.map(card)}</ul>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune absence enregistrée.</p>
            )}
          </section>
        </>
      )}

      {adding && technicians.data && (
        <LeaveDialog technicians={technicians.data} onClose={() => setAdding(false)} />
      )}
      {toDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setToDelete(null)}
          title="Supprimer cette absence ?"
          description={`${toDelete.technician_name} — ${LEAVE_LABELS[toDelete.leave_type]} ${leavePeriod(toDelete.starts_on, toDelete.ends_on)}.`}
          confirmLabel="Supprimer"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })}
        />
      )}
    </div>
  );
}
