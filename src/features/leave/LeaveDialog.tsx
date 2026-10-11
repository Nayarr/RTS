import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/features/repair-orders/schemas';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { saveLeaveRequest } from './api';
import {
  halfDayTimes,
  LEAVE_DURATIONS,
  LEAVE_LABELS,
  leaveDays,
  leaveHours,
  type LeaveDuration,
} from './domain';
import { useLeaveMutation } from './hooks';

const selectClass = 'inp';
const time = z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d/, 'Heure invalide')]);

const leaveSchema = z
  .object({
    technician_id: z.string(),
    leave_type: z.enum(['paid_leave', 'sick', 'training', 'other']),
    duration: z.enum(['days', 'morning', 'afternoon', 'hours']),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date de début'),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date de fin'),
    start_time: time,
    end_time: time,
    comment: z.string().trim().max(300),
  })
  .superRefine((values, ctx) => {
    if (values.duration === 'days') {
      if (values.ends_on < values.starts_on) {
        ctx.addIssue({
          code: 'custom',
          path: ['ends_on'],
          message: 'La fin doit être le même jour ou après le début',
        });
      }
      return;
    }
    if (!values.start_time)
      ctx.addIssue({ code: 'custom', path: ['start_time'], message: 'Indique l’heure de début' });
    if (!values.end_time)
      ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'Indique l’heure de fin' });
    if (values.start_time && values.end_time && values.end_time <= values.start_time) {
      ctx.addIssue({ code: 'custom', path: ['end_time'], message: 'La fin doit être après le début' });
    }
  });
type LeaveValues = z.infer<typeof leaveSchema>;

interface LeaveDialogProps {
  /** Direction : choix du technicien, absence validée d'office. Sinon : demande du technicien connecté. */
  technicians?: { id: string; display_name: string }[];
  onClose: () => void;
}

/** Horaires de l'atelier (Réglages) : matin et après-midi proposés d'après eux. */
function useWorkdayHours() {
  return useQuery({
    queryKey: ['app-settings', 'workday-hours'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('workday_start, workday_end, lunch_start, lunch_end')
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 10 * 60_000,
  });
}

/**
 * « Ajouter une absence » (direction) ou « Demande de congé » (technicien) : jours entiers, matin,
 * après-midi ou quelques heures d'une journée.
 */
export function LeaveDialog({ technicians, onClose }: LeaveDialogProps) {
  const forDirection = technicians !== undefined;
  const workday = useWorkdayHours();
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LeaveValues>({
    resolver: zodResolver(
      forDirection
        ? leaveSchema.refine((values) => values.technician_id !== '', {
            path: ['technician_id'],
            message: 'Choisis un technicien',
          })
        : leaveSchema,
    ),
    defaultValues: {
      technician_id: technicians?.[0]?.id ?? '',
      leave_type: 'paid_leave',
      duration: 'days',
      starts_on: todayIso(),
      ends_on: todayIso(),
      start_time: '',
      end_time: '',
      comment: '',
    },
  });
  const [duration, startsOn, endsOn, startTime, endTime] = useWatch({
    control,
    name: ['duration', 'starts_on', 'ends_on', 'start_time', 'end_time'],
  });
  const partial = duration !== 'days';
  const days = !partial && startsOn && endsOn && endsOn >= startsOn ? leaveDays(startsOn, endsOn) : null;
  const hours =
    partial && startTime && endTime && endTime > startTime ? leaveHours(startTime, endTime) : null;

  const chooseDuration = (value: LeaveDuration) => {
    setValue('duration', value);
    if (value === 'morning' || value === 'afternoon') {
      const [start, end] = halfDayTimes(value, workday.data ?? null);
      setValue('start_time', start);
      setValue('end_time', end);
    } else if (value === 'days') {
      setValue('start_time', '');
      setValue('end_time', '');
    }
  };

  const save = useLeaveMutation(
    (values: LeaveValues) =>
      saveLeaveRequest({
        technician_id: forDirection ? values.technician_id : null,
        leave_type: values.leave_type,
        starts_on: values.starts_on,
        // Quelques heures : un seul jour
        ends_on: values.duration === 'days' ? values.ends_on : values.starts_on,
        start_time: values.duration === 'days' ? null : values.start_time,
        end_time: values.duration === 'days' ? null : values.end_time,
        comment: values.comment.trim(),
      }),
    forDirection ? 'Absence enregistrée' : 'Demande envoyée à la direction',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{forDirection ? 'Ajouter une absence' : 'Demande de congé'}</DialogTitle>
          <DialogDescription>
            {forDirection
              ? 'Saisie par la direction : l’absence est validée directement.'
              : 'La direction validera ta demande.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="leave-form"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          {forDirection && (
            <div className="space-y-2">
              <Label htmlFor="leave-technician">Technicien</Label>
              <select id="leave-technician" className={selectClass} {...register('technician_id')}>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="leave-type">Type</Label>
            <select id="leave-type" className={selectClass} {...register('leave_type')}>
              {Object.entries(LEAVE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <span className="lbl" id="leave-duration-label">
              Durée
            </span>
            <div className="seg flex-wrap" role="group" aria-labelledby="leave-duration-label">
              {LEAVE_DURATIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cn(duration === value && 'on')}
                  aria-pressed={duration === value}
                  onClick={() => chooseDuration(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {partial ? (
            <div className="grid grid-cols-3 gap-3">
              <FormField
                id="leave-start"
                label="Le"
                type="date"
                error={errors.starts_on?.message}
                {...register('starts_on')}
              />
              <FormField
                id="leave-start-time"
                label="De"
                type="time"
                error={errors.start_time?.message}
                {...register('start_time')}
              />
              <FormField
                id="leave-end-time"
                label="À"
                type="time"
                error={errors.end_time?.message}
                {...register('end_time')}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <FormField
                id="leave-start"
                label="Du"
                type="date"
                error={errors.starts_on?.message}
                {...register('starts_on')}
              />
              <FormField
                id="leave-end"
                label="Au (inclus)"
                type="date"
                error={errors.ends_on?.message}
                {...register('ends_on')}
              />
            </div>
          )}
          {days !== null && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {days} jour{days > 1 ? 's' : ''} (dimanches non comptés)
            </p>
          )}
          {hours !== null && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {hours.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h d’absence
            </p>
          )}
          <FormField
            id="leave-comment"
            label="Commentaire"
            placeholder="Facultatif"
            {...register('comment')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="leave-form" disabled={save.isPending}>
            {forDirection ? 'Enregistrer l’absence' : 'Envoyer la demande'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
