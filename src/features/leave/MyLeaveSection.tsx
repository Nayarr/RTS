import { useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import { deleteLeaveRequest, type LeaveRequest } from './api';
import { LEAVE_LABELS, LEAVE_STATUS_META, leavePeriod } from './domain';
import { useLeaveMutation, useLeaveRequests } from './hooks';
import { LeaveDialog } from './LeaveDialog';

/** Espace technicien : demander un congé, suivre ses demandes et ses absences à venir. */
export function MyLeaveSection() {
  const leaves = useLeaveRequests();
  const [requesting, setRequesting] = useState(false);
  const [toCancel, setToCancel] = useState<LeaveRequest | null>(null);
  const cancel = useLeaveMutation((id: string) => deleteLeaveRequest(id), 'Demande annulée');
  const today = todayIso();
  const upcoming = (leaves.data ?? [])
    .filter((leave) => leave.status === 'requested' || leave.ends_on >= today)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));

  return (
    <section id="conges" data-slot="card" aria-labelledby="my-leave" className="card scroll-mt-20">
      <div className="card-h min-h-[50px]! px-3.5! py-2.5!">
        <h2 id="my-leave" className="h2 text-[17px]!">
          Mes congés
        </h2>
        <Button
          size="sm"
          variant="outline"
          aria-label="Demander un congé"
          onClick={() => setRequesting(true)}
        >
          <CalendarOff /> Demander
        </Button>
      </div>
      {upcoming.length === 0 ? (
        <p className="hint px-3.5 py-3">Aucun congé à venir.</p>
      ) : (
        <ul>
          {upcoming.map((leave) => (
            <li key={leave.id} className="li px-3.5! py-2.5!">
              <span className="col gap-0">
                <b className="text-[13.5px]">{LEAVE_LABELS[leave.leave_type]}</b>
                <span className="hint">
                  {leavePeriod(leave.starts_on, leave.ends_on, leave.start_time, leave.end_time)}
                </span>
              </span>
              <span className="row gap-2">
                <span className={cn('badge', LEAVE_STATUS_META[leave.status].badge)}>
                  {LEAVE_STATUS_META[leave.status].label}
                </span>
                {leave.status === 'requested' && (
                  <Button variant="ghost" size="sm" onClick={() => setToCancel(leave)}>
                    Annuler
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {requesting && <LeaveDialog onClose={() => setRequesting(false)} />}
      {toCancel && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setToCancel(null)}
          title="Annuler cette demande ?"
          description={`${LEAVE_LABELS[toCancel.leave_type]} ${leavePeriod(toCancel.starts_on, toCancel.ends_on, toCancel.start_time, toCancel.end_time)}.`}
          confirmLabel="Annuler la demande"
          destructive
          pending={cancel.isPending}
          onConfirm={() => cancel.mutate(toCancel.id, { onSuccess: () => setToCancel(null) })}
        />
      )}
    </section>
  );
}
