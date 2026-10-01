import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { saveLeaveRequest } from './api';
import { LEAVE_LABELS, leaveDays } from './domain';
import { useLeaveMutation } from './hooks';

const selectClass = 'inp';

const leaveSchema = z
  .object({
    technician_id: z.string(),
    leave_type: z.enum(['paid_leave', 'sick', 'training', 'other']),
    starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date de début'),
    ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date de fin'),
    comment: z.string().trim().max(300),
  })
  .refine((values) => values.ends_on >= values.starts_on, {
    path: ['ends_on'],
    message: 'La fin doit être le même jour ou après le début',
  });
type LeaveValues = z.infer<typeof leaveSchema>;

interface LeaveDialogProps {
  /** Direction : choix du technicien, absence validée d'office. Sinon : demande du technicien connecté. */
  technicians?: { id: string; display_name: string }[];
  onClose: () => void;
}

/** « Ajouter une absence » (direction) ou « Demande de congé » (technicien). */
export function LeaveDialog({ technicians, onClose }: LeaveDialogProps) {
  const forDirection = technicians !== undefined;
  const {
    control,
    register,
    handleSubmit,
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
      starts_on: todayIso(),
      ends_on: todayIso(),
      comment: '',
    },
  });
  const [startsOn, endsOn] = useWatch({ control, name: ['starts_on', 'ends_on'] });
  const days = startsOn && endsOn && endsOn >= startsOn ? leaveDays(startsOn, endsOn) : null;

  const save = useLeaveMutation(
    (values: LeaveValues) =>
      saveLeaveRequest({
        technician_id: forDirection ? values.technician_id : null,
        leave_type: values.leave_type,
        starts_on: values.starts_on,
        ends_on: values.ends_on,
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
          {days !== null && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {days} jour{days > 1 ? 's' : ''} (dimanches non comptés)
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
