import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { clearTechnicianPin, setTechnicianPin } from './api';
import { useTeamMutation } from './hooks';
import { pinSchema, type PinValues } from './schemas';
import type { TeamMember } from './types';

interface PinDialogProps {
  member: TeamMember | null;
  onOpenChange: (open: boolean) => void;
}

/** Code PIN de pointage sur la borne (4 à 6 chiffres, jamais réaffiché). */
export function PinDialog({ member, onOpenChange }: PinDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PinValues>({ resolver: zodResolver(pinSchema), defaultValues: { pin: '', confirmation: '' } });

  const setPin = useTeamMutation(
    ({ technicianId, pin }: { technicianId: string; pin: string }) => setTechnicianPin(technicianId, pin),
    'Code PIN enregistré',
  );
  const clearPin = useTeamMutation(clearTechnicianPin, 'Code PIN supprimé');

  useEffect(() => {
    if (member) reset({ pin: '', confirmation: '' });
  }, [member, reset]);

  const technician = member?.technician;
  if (!member || !technician) return null;

  const onSubmit = handleSubmit(({ pin }) =>
    setPin.mutate({ technicianId: technician.id, pin }, { onSuccess: () => onOpenChange(false) }),
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Code PIN de {technician.display_name}</DialogTitle>
          <DialogDescription>
            Sert à pointer sur la borne de l’atelier. Le code n’est jamais réaffiché : communique-le
            directement au technicien.
          </DialogDescription>
        </DialogHeader>
        <form id="pin-form" onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField
            id="pin"
            label="Nouveau code"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            error={errors.pin?.message}
            {...register('pin')}
          />
          <FormField
            id="pin-confirmation"
            label="Confirmation"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            error={errors.confirmation?.message}
            {...register('confirmation')}
          />
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {member.pinSetAt ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={clearPin.isPending}
              onClick={() => clearPin.mutate(technician.id, { onSuccess: () => onOpenChange(false) })}
            >
              Supprimer le code
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" form="pin-form" disabled={setPin.isPending}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
