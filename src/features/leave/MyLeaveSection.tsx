import { useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
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
    <section aria-labelledby="my-leave" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-leave" className="text-lg font-bold">
          Mes congés
        </h2>
        <Button variant="outline" onClick={() => setRequesting(true)}>
          <CalendarOff /> Demander un congé
        </Button>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun congé à venir.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((leave) => (
            <li key={leave.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <strong>{LEAVE_LABELS[leave.leave_type]}</strong>{' '}
                {leavePeriod(leave.starts_on, leave.ends_on)}
              </span>
              <span className="flex items-center gap-2">
                <Badge className={cn(LEAVE_STATUS_META[leave.status].className)}>
                  {LEAVE_STATUS_META[leave.status].label}
                </Badge>
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
          description={`${LEAVE_LABELS[toCancel.leave_type]} ${leavePeriod(toCancel.starts_on, toCancel.ends_on)}.`}
          confirmLabel="Annuler la demande"
          destructive
          pending={cancel.isPending}
          onConfirm={() => cancel.mutate(toCancel.id, { onSuccess: () => setToCancel(null) })}
        />
      )}
    </section>
  );
}
