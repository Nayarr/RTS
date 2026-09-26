import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { saveTechnician, setTechnicianActive, updateProfile } from './api';
import { useTeamMutation } from './hooks';
import { RoleSelect } from './RoleSelect';
import { editAccountSchema, mustBeTechnician, TECHNICIAN_COLORS, type EditAccountValues } from './schemas';
import { TechnicianFields } from './TechnicianFields';
import type { TeamMember } from './types';

function toFormValues(member: TeamMember): EditAccountValues {
  const technician = member.technician?.is_active ? member.technician : null;
  return {
    full_name: member.full_name,
    role: member.role,
    is_technician: Boolean(technician),
    display_name: technician?.display_name ?? member.full_name.split(/\s+/)[0] ?? '',
    color: technician?.color ?? TECHNICIAN_COLORS[0],
    exclude_from_planning: technician?.exclude_from_planning ?? false,
    rest_group: technician?.rest_group ?? 'none',
  };
}

/** Enregistre le profil, puis crée / met à jour / retire la fiche technicien. */
async function saveMember({ member, values }: { member: TeamMember; values: EditAccountValues }) {
  await updateProfile(member.id, { full_name: values.full_name.trim(), role: values.role });
  if (values.is_technician) {
    await saveTechnician(member.id, member.technician?.id ?? null, {
      display_name: values.display_name.trim(),
      color: values.color,
      exclude_from_planning: values.exclude_from_planning,
      rest_group: values.rest_group === 'none' ? null : values.rest_group,
    });
    if (member.technician && !member.technician.is_active)
      await setTechnicianActive(member.technician.id, true);
  } else if (member.technician?.is_active) {
    // La fiche est conservée (historique des OR et des pointages) mais sort du planning.
    await setTechnicianActive(member.technician.id, false);
  }
}

interface EditAccountDialogProps {
  member: TeamMember | null;
  onOpenChange: (open: boolean) => void;
}

export function EditAccountDialog({ member, onOpenChange }: EditAccountDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EditAccountValues>({ resolver: zodResolver(editAccountSchema) });

  const save = useTeamMutation(saveMember, ({ values }) => `${values.full_name} mis à jour`);

  useEffect(() => {
    if (member) reset(toFormValues(member));
  }, [member, reset]);

  const role = useWatch({ control, name: 'role' });
  const isTechnician = useWatch({ control, name: 'is_technician' });

  useEffect(() => {
    if (role && mustBeTechnician(role)) setValue('is_technician', true);
  }, [role, setValue]);

  if (!member) return null;

  const onSubmit = handleSubmit((values) =>
    save.mutate({ member, values }, { onSuccess: () => onOpenChange(false) }),
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le compte</DialogTitle>
          <DialogDescription>{member.email}</DialogDescription>
        </DialogHeader>

        <form id="edit-account" onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField
            id="edit-full_name"
            label="Nom complet"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <Controller
            control={control}
            name="role"
            render={({ field }) => <RoleSelect value={field.value} onChange={field.onChange} />}
          />
          <TechnicianFields
            control={control}
            register={register}
            errors={errors}
            isTechnician={isTechnician}
            locked={Boolean(role) && mustBeTechnician(role)}
          />

          {isTechnician && (
            <fieldset className="space-y-4 rounded-lg border p-4">
              <legend className="px-1 text-sm font-semibold">Planning</legend>
              <Controller
                control={control}
                name="exclude_from_planning"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="exclude_from_planning"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                    <Label htmlFor="exclude_from_planning">Masquer du planning</Label>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="rest_group"
                render={({ field }) => (
                  <div className="space-y-2">
                    <Label htmlFor="rest_group">Repos tournant (un lundi sur deux)</Label>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="rest_group" className="h-11 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Pas de rotation</SelectItem>
                        <SelectItem value="A">Groupe A</SelectItem>
                        <SelectItem value="B">Groupe B</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              />
            </fieldset>
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="submit" form="edit-account" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
