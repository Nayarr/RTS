import { useState } from 'react';
import { useForm } from 'react-hook-form';
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
import { useFileUrl } from '@/features/files/hooks';
import { dayLabel } from '@/features/planning/domain';
import { addManualClockEvent, setKioskExitCode, type TechnicianDay } from './api';
import { useAttendanceMutation } from './hooks';

const selectClass = 'inp';

const manualSchema = z.object({
  technician_id: z.string().min(1, 'Choisis un technicien'),
  event_type: z.enum(['in', 'out']),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide'),
  reason: z.string().trim().min(1, 'Indique le motif').max(200),
});
type ManualValues = z.infer<typeof manualSchema>;

/** Correction de pointage : oubli de badge, panne de la borne (marquée « manuel »). */
export function ManualClockDialog({
  date,
  technicians,
  onClose,
}: {
  date: string;
  technicians: Pick<TechnicianDay, 'id' | 'display_name'>[];
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ManualValues>({
    resolver: zodResolver(manualSchema),
    defaultValues: { technician_id: technicians[0]?.id ?? '', event_type: 'in', time: '09:00', reason: '' },
  });
  const save = useAttendanceMutation(
    (values: ManualValues) =>
      addManualClockEvent({ ...values, work_date: date, reason: values.reason.trim() }),
    'Correction enregistrée',
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correction de pointage</DialogTitle>
          <DialogDescription>
            {dayLabel(date)} — pour un oubli de badge ou une panne de la borne. La correction est marquée «
            manuel ».
          </DialogDescription>
        </DialogHeader>
        <form
          id="manual-clock"
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
        >
          <div className="space-y-2">
            <Label htmlFor="manual-technician">Technicien</Label>
            <select id="manual-technician" className={selectClass} {...register('technician_id')}>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.display_name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="manual-type">Type</Label>
              <select id="manual-type" className={selectClass} {...register('event_type')}>
                <option value="in">Arrivée</option>
                <option value="out">Départ</option>
              </select>
            </div>
            <FormField
              id="manual-time"
              label="Heure"
              type="time"
              error={errors.time?.message}
              {...register('time')}
            />
          </div>
          <FormField
            id="manual-reason"
            label="Motif"
            placeholder="Ex : oubli de badge"
            error={errors.reason?.message}
            {...register('reason')}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="manual-clock" disabled={save.isPending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Code de sortie de la borne (4 à 6 chiffres), saisi deux fois. */
export function ExitCodeDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const save = useAttendanceMutation((value: string) => setKioskExitCode(value), 'Code de sortie enregistré');
  const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

  const submit = () => {
    if (!/^\d{4,6}$/.test(code)) return setError('Le code doit contenir 4 à 6 chiffres');
    if (code !== confirm) return setError('Les deux codes ne correspondent pas');
    save.mutate(code, { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Code de sortie de la borne</DialogTitle>
          <DialogDescription>
            Demandé pour quitter la borne sur la tablette. Réservé à la direction.
          </DialogDescription>
        </DialogHeader>
        <form
          id="exit-code"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <FormField
            id="exit-code-new"
            label="Nouveau code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={code}
            onChange={(event) => setCode(digits(event.target.value))}
          />
          <FormField
            id="exit-code-confirm"
            label="Confirme le code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            error={error}
            onChange={(event) => setConfirm(digits(event.target.value))}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="exit-code" disabled={save.isPending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Photo prise par la borne au moment du pointage. */
export function ClockPhotoDialog({
  title,
  fileId,
  onClose,
}: {
  title: string;
  fileId: string;
  onClose: () => void;
}) {
  const { url, isPending } = useFileUrl(fileId);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Photo prise par la borne.</DialogDescription>
        </DialogHeader>
        {url ? (
          <img src={url} alt={title} className="w-full rounded-md" />
        ) : (
          <p className="text-muted-foreground">{isPending ? 'Chargement…' : 'Photo indisponible.'}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
