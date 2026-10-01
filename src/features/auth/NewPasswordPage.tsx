import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authErrorMessage, updatePassword } from './api';
import { useAuth } from './auth-context';
import { AuthCard } from './AuthLayout';
import { newPasswordSchema, PASSWORD_MIN_LENGTH, type NewPasswordValues } from './schemas';

/**
 * Choix d'un nouveau mot de passe, après ouverture du lien reçu par e-mail
 * (le lien ouvre une session temporaire, détectée automatiquement par Supabase).
 */
export function NewPasswordPage() {
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setSubmitError(null);
    try {
      await updatePassword(password);
      await navigate('/', { replace: true });
    } catch (error) {
      setSubmitError(authErrorMessage(error));
    }
  });

  if (isLoading) return null;

  return (
    <AuthCard>
      <div className="col gap-1">
        <h1 className="title">Nouveau mot de passe</h1>
        <p className="sub">
          Au moins {PASSWORD_MIN_LENGTH} caractères, avec au moins une lettre et un chiffre.
        </p>
      </div>
      {!session ? (
        <Alert variant="destructive">
          <AlertDescription>Ce lien a expiré ou a déjà été utilisé. Refais une demande.</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="col gap-[22px]">
          <FormField
            id="new-password"
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            className="h-12 text-[15px]!"
            error={errors.password?.message}
            {...register('password')}
          />
          <FormField
            id="new-password-confirmation"
            label="Confirmation"
            type="password"
            autoComplete="new-password"
            className="h-12 text-[15px]!"
            error={errors.confirmation?.message}
            {...register('confirmation')}
          />
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
          </Button>
        </form>
      )}
      <Link to="/connexion" className="link text-center text-[13.5px]">
        Retour à la connexion
      </Link>
    </AuthCard>
  );
}
