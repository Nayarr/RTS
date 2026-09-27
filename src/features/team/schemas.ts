import { z } from 'zod';
import { PASSWORD_MIN_LENGTH } from '@/features/auth/schemas';
import type { CreateAccountInput } from './types';

export const ROLE_VALUES = ['direction', 'reception', 'technician', 'kiosk'] as const;

/** Couleurs proposées pour le planning (reprises de l'ancienne appli). */
export const TECHNICIAN_COLORS = [
  '#2A6B52',
  '#4750B5',
  '#C98A00',
  '#8B3A9E',
  '#1F6FA6',
  '#B5453A',
  '#5A7D3A',
  '#A6461F',
] as const;

const technicianFields = {
  // Pour un compte technicien, ou un compte bureau qui intervient aussi à l'atelier.
  is_technician: z.boolean(),
  display_name: z.string().trim().max(40, '40 caractères maximum'),
  color: z.string().nullable(),
};

/** Le nom au planning est obligatoire dès qu'il y a une fiche technicien. */
const requireDisplayName = <T extends { is_technician: boolean; display_name: string }>(
  values: T,
  ctx: z.RefinementCtx,
) => {
  if (values.is_technician && values.display_name.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['display_name'], message: 'Indique le nom affiché au planning' });
  }
};

export const createAccountSchema = z
  .object({
    email: z.email({ message: 'Adresse e-mail invalide' }),
    full_name: z.string().trim().min(1, 'Indique le nom').max(80, '80 caractères maximum'),
    role: z.enum(ROLE_VALUES),
    ...technicianFields,
    access: z.enum(['invite', 'password']),
    password: z.string(),
  })
  .superRefine((values, ctx) => {
    requireDisplayName(values, ctx);
    if (values.access === 'password') {
      if (values.password.length < PASSWORD_MIN_LENGTH)
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: `Au moins ${PASSWORD_MIN_LENGTH} caractères`,
        });
      else if (!/[A-Za-z]/.test(values.password) || !/\d/.test(values.password))
        ctx.addIssue({ code: 'custom', path: ['password'], message: 'Au moins une lettre et un chiffre' });
    }
  });
export type CreateAccountValues = z.infer<typeof createAccountSchema>;

export const editAccountSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Indique le nom').max(80, '80 caractères maximum'),
    role: z.enum(ROLE_VALUES),
    ...technicianFields,
    exclude_from_planning: z.boolean(),
    rest_group: z.enum(['none', 'A', 'B']),
  })
  .superRefine(requireDisplayName);
export type EditAccountValues = z.infer<typeof editAccountSchema>;

export const pinSchema = z
  .object({
    pin: z.string().regex(/^\d{4,6}$/, 'De 4 à 6 chiffres'),
    confirmation: z.string(),
  })
  .refine((values) => values.pin === values.confirmation, {
    message: 'Les deux codes ne correspondent pas',
    path: ['confirmation'],
  });
export type PinValues = z.infer<typeof pinSchema>;

/** Le rôle Technicien implique toujours une fiche technicien. */
export const mustBeTechnician = (role: (typeof ROLE_VALUES)[number]) => role === 'technician';

/** Valeurs du formulaire -> données envoyées à l'Edge Function. */
export function toCreateAccountInput(values: CreateAccountValues): CreateAccountInput {
  return {
    email: values.email.trim().toLowerCase(),
    full_name: values.full_name.trim(),
    role: values.role,
    technician: values.is_technician
      ? { display_name: values.display_name.trim(), color: values.color }
      : null,
    ...(values.access === 'password' ? { password: values.password } : {}),
  };
}
