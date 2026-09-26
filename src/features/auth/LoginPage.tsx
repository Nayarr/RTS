import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation } from 'react-router';
import { CircleCheck, LogIn } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authErrorMessage, requestPasswordReset, signIn } from './api';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';
import {
  loginSchema,
  passwordResetRequestSchema,
  type LoginValues,
  type PasswordResetRequestValues,
} from './schemas';

export function LoginPage() {
  const { session } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  return (
    <AuthLayout>
      {mode === 'login' ? (
        <LoginForm onForgotPassword={() => setMode('reset')} />
      ) : (
        <PasswordResetForm onBack={() => setMode('login')} />
      )}
    </AuthLayout>
  );
}

function LoginForm({ onForgotPassword }: { onForgotPassword: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setSubmitError(null);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      setSubmitError(authErrorMessage(error));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Connexion</h1>
        </CardTitle>
        <CardDescription>Accès réservé — utilise les identifiants fournis par le bureau.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormField
            id="email"
            label="E-mail"
            type="email"
            autoComplete="username"
            inputMode="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <FormField
            id="password"
            label="Mot de passe"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isSubmitting}>
            <LogIn />
            {isSubmitting ? 'Connexion…' : 'Se connecter'}
          </Button>
          <Button type="button" variant="link" className="w-full" onClick={onForgotPassword}>
            Mot de passe oublié ?
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordResetForm({ onBack }: { onBack: () => void }) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordResetRequestValues>({
    resolver: zodResolver(passwordResetRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setSubmitError(null);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (error) {
      setSubmitError(authErrorMessage(error));
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Mot de passe oublié</h1>
        </CardTitle>
        <CardDescription>Tu vas recevoir un lien pour choisir un nouveau mot de passe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {sentTo ? (
          <Alert>
            <CircleCheck />
            <AlertDescription>
              Si un compte existe pour {sentTo}, un e-mail vient d’être envoyé. Pense à vérifier les spams.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <FormField
              id="reset-email"
              label="E-mail"
              type="email"
              autoComplete="username"
              inputMode="email"
              error={errors.email?.message}
              {...register('email')}
            />
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi…' : 'Envoyer le lien'}
            </Button>
          </form>
        )}
        <Button type="button" variant="link" className="w-full" onClick={onBack}>
          ← Retour à la connexion
        </Button>
      </CardContent>
    </Card>
  );
}
