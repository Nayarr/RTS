import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authErrorMessage, updatePassword } from './api';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';
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
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl">Nouveau mot de passe</h1>
          </CardTitle>
          <CardDescription>
            Au moins {PASSWORD_MIN_LENGTH} caractères, avec au moins une lettre et un chiffre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!session ? (
            <div className="space-y-5">
              <Alert variant="destructive">
                <AlertDescription>
                  Ce lien a expiré ou a déjà été utilisé. Refais une demande.
                </AlertDescription>
              </Alert>
              <Button asChild variant="outline" className="w-full">
                <Link to="/connexion">Retour à la connexion</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="space-y-5">
              <FormField
                id="new-password"
                label="Nouveau mot de passe"
                type="password"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <FormField
                id="new-password-confirmation"
                label="Confirmation"
                type="password"
                autoComplete="new-password"
                error={errors.confirmation?.message}
                {...register('confirmation')}
              />
              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
