import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { createAccount } from './api';
import { useTeamMutation } from './hooks';
import { RoleSelect } from './RoleSelect';
import {
  createAccountSchema,
  mustBeTechnician,
  TECHNICIAN_COLORS,
  toCreateAccountInput,
  type CreateAccountValues,
} from './schemas';
import { TechnicianFields } from './TechnicianFields';

const DEFAULT_VALUES: CreateAccountValues = {
  email: '',
  full_name: '',
  role: 'technician',
  is_technician: true,
  display_name: '',
  color: TECHNICIAN_COLORS[0],
  access: 'invite',
  password: '',
};

const ACCESS_OPTIONS = [
  {
    value: 'invite',
    label: 'Invitation par e-mail',
    hint: 'La personne choisit elle-même son mot de passe.',
  },
  {
    value: 'password',
    label: 'Mot de passe provisoire',
    hint: 'Pour une tablette partagée ou sans accès e-mail.',
  },
] as const;

export function CreateAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getFieldState,
    reset,
    formState: { errors },
  } = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const create = useTeamMutation(createAccount, (input) =>
    input.password ? `Compte créé pour ${input.full_name}` : `Invitation envoyée à ${input.email}`,
  );

  const role = useWatch({ control, name: 'role' });
  const isTechnician = useWatch({ control, name: 'is_technician' });
  const access = useWatch({ control, name: 'access' });

  // Le rôle Technicien implique une fiche technicien.
  useEffect(() => {
    if (mustBeTechnician(role)) setValue('is_technician', true);
  }, [role, setValue]);

  // Nom au planning = prénom, tant qu'il n'a pas été modifié à la main.
  const fullName = useWatch({ control, name: 'full_name' });
  useEffect(() => {
    if (isTechnician && !getFieldState('display_name').isDirty) {
      setValue('display_name', fullName.trim().split(/\s+/)[0] ?? '');
    }
  }, [fullName, isTechnician, getFieldState, setValue]);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset(DEFAULT_VALUES);
  };

  const onSubmit = handleSubmit((values) =>
    create.mutate(toCreateAccountInput(values), { onSuccess: () => close(false) }),
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau compte</DialogTitle>
          <DialogDescription>Crée l’accès d’un membre de l’équipe ou de la borne atelier.</DialogDescription>
        </DialogHeader>

        <form id="create-account" onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField
            id="full_name"
            label="Nom complet"
            autoComplete="off"
            error={errors.full_name?.message}
            {...register('full_name')}
          />
          <FormField
            id="email"
            label="E-mail de connexion"
            type="email"
            autoComplete="off"
            inputMode="email"
            error={errors.email?.message}
            {...register('email')}
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
            locked={mustBeTechnician(role)}
          />

          <Controller
            control={control}
            name="access"
            render={({ field }) => (
              <div className="space-y-2">
                <Label id="access-label">Accès</Label>
                <div role="radiogroup" aria-labelledby="access-label" className="grid gap-2 sm:grid-cols-2">
                  {ACCESS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={field.value === option.value}
                      onClick={() => field.onChange(option.value)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition',
                        field.value === option.value ? 'border-primary bg-accent' : 'hover:bg-muted',
                      )}
                    >
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          />
          {access === 'password' && (
            <FormField
              id="password"
              label="Mot de passe provisoire"
              type="text"
              autoComplete="off"
              error={errors.password?.message}
              {...register('password')}
            />
          )}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Annuler
          </Button>
          <Button type="submit" form="create-account" disabled={create.isPending}>
            {create.isPending ? 'Création…' : 'Créer le compte'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
