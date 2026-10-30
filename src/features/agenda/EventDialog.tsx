import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { deleteEvent, saveEvent } from './api';
import type { PersonalEvent } from './domain';
import { useAgendaMutation } from './hooks';
import { eventFromForm, eventSchema, eventToForm, type EventPreset, type EventValues } from './schemas';

/** Rendez-vous de l'agenda : création (`event` null) ou modification, suppression. */
export function EventDialog({
  event,
  preset,
  onClose,
}: {
  event: PersonalEvent | null;
  preset: EventPreset;
  onClose: () => void;
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EventValues>({ resolver: zodResolver(eventSchema), defaultValues: eventToForm(event, preset) });
  const allDay = useWatch({ control, name: 'all_day' });
  const [confirming, setConfirming] = useState(false);

  const save = useAgendaMutation(
    (values: EventValues) => saveEvent({ ...eventFromForm(values), ...(event ? { id: event.id } : {}) }),
    event ? 'Rendez-vous modifié' : 'Rendez-vous ajouté à ton agenda',
  );
  const remove = useAgendaMutation(() => deleteEvent(event?.id ?? ''), 'Rendez-vous supprimé');

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{event ? 'Rendez-vous' : 'Nouveau rendez-vous'}</DialogTitle>
            <DialogDescription>Dans ton agenda : personne d’autre ne le voit.</DialogDescription>
          </DialogHeader>
          <form
            id="event-form"
            noValidate
            className="space-y-4"
            onSubmit={handleSubmit((values) => save.mutate(values, { onSuccess: onClose }))}
          >
            <FormField
              id="event-title"
              label="Objet"
              placeholder="Ex : Rendez-vous banque, appel fournisseur"
              autoComplete="off"
              error={errors.title?.message}
              {...register('title')}
            />
            <div className="grid gap-3.5 sm:grid-cols-[1fr_auto] sm:items-end">
              <FormField
                id="event-date"
                label={allDay ? 'Du' : 'Date'}
                type="date"
                error={errors.date?.message}
                {...register('date')}
              />
              <Controller
                control={control}
                name="all_day"
                render={({ field }) => (
                  <div className="flex h-10 items-center gap-2">
                    <Checkbox
                      id="event-all-day"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="event-all-day">Journée entière</Label>
                  </div>
                )}
              />
            </div>
            {allDay ? (
              <FormField
                id="event-end-date"
                label="Au (inclus)"
                type="date"
                error={errors.end_date?.message}
                {...register('end_date')}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3.5">
                <FormField
                  id="event-start"
                  label="Début"
                  type="time"
                  step={300}
                  error={errors.start?.message}
                  {...register('start')}
                />
                <FormField
                  id="event-end"
                  label="Fin"
                  type="time"
                  step={300}
                  error={errors.end?.message}
                  {...register('end')}
                />
              </div>
            )}
            <FormField
              id="event-location"
              label="Lieu (facultatif)"
              autoComplete="off"
              error={errors.location?.message}
              {...register('location')}
            />
            <div className="field">
              <Label htmlFor="event-notes">Notes (facultatif)</Label>
              <Textarea id="event-notes" rows={3} {...register('notes')} />
              {errors.notes && <p className="err">{errors.notes.message}</p>}
            </div>
          </form>
          <DialogFooter className="sm:justify-between">
            {event ? (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
                <Trash2 /> Supprimer
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" form="event-form" disabled={save.isPending}>
                {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Supprimer ce rendez-vous ?"
        description={event?.title ?? ''}
        confirmLabel="Supprimer"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
      />
    </>
  );
}
