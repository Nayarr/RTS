import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/features/repair-orders/constants';
import { addScheduleException, deleteScheduleException, fetchScheduleExceptions } from './api';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Enregistrement impossible';

/**
 * Présences en plus d'un technicien hors de ses jours habituels (alternant présent les deux semaines
 * pendant les vacances…) : ces jours-là, une absence de badgeage est une absence.
 */
export function ScheduleExceptionsField({ technicianId }: { technicianId: string }) {
  const queryClient = useQueryClient();
  const key = ['team', 'schedule-exceptions', technicianId];
  const exceptions = useQuery({ queryKey: key, queryFn: () => fetchScheduleExceptions(technicianId) });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    mutationFn: () =>
      addScheduleException({
        technician_id: technicianId,
        starts_on: from,
        ends_on: to || from,
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      toast.success('Présence en plus enregistrée');
      setFrom('');
      setTo('');
      setNote('');
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: deleteScheduleException,
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  const invalid = !from || (to !== '' && to < from);

  return (
    <div className="space-y-2">
      <Label>Présences en plus</Label>
      <p className="hint">Ex. : alternant présent les deux semaines pendant les vacances.</p>
      {(exceptions.data ?? []).length > 0 && (
        <ul className="space-y-1" aria-label="Présences en plus">
          {(exceptions.data ?? []).map((exception) => (
            <li key={exception.id} className="row between gap-2 text-[13.5px]">
              <span>
                {exception.starts_on === exception.ends_on
                  ? `Le ${formatDate(exception.starts_on)}`
                  : `Du ${formatDate(exception.starts_on)} au ${formatDate(exception.ends_on)}`}
                {exception.note && <span className="muted"> · {exception.note}</span>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Retirer la présence du ${formatDate(exception.starts_on)}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(exception.id)}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="exception-from" className="text-xs">
            Du
          </Label>
          <Input
            id="exception-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exception-to" className="text-xs">
            Au
          </Label>
          <Input
            id="exception-to"
            type="date"
            min={from || undefined}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exception-note" className="text-xs">
            Motif (facultatif)
          </Label>
          <Input
            id="exception-note"
            maxLength={200}
            placeholder="Vacances scolaires"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={invalid || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus /> Ajouter
        </Button>
      </div>
    </div>
  );
}
