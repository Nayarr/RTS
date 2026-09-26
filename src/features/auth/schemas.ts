import { z } from 'zod';

const email = z.email({ message: 'Adresse e-mail invalide' });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Renseigne ton mot de passe'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({ email });
export type PasswordResetRequestValues = z.infer<typeof passwordResetRequestSchema>;

export const PASSWORD_MIN_LENGTH = 10;

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Au moins ${PASSWORD_MIN_LENGTH} caractères`)
      .regex(/[A-Za-z]/, 'Au moins une lettre')
      .regex(/\d/, 'Au moins un chiffre'),
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmation'],
  });
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
