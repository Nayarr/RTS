import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useLocation } from 'react-router';
import { CircleCheck, LogIn } from 'lucide-react';
import { FormField } from '@/components/FormField';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  const [resetOpen, setResetOpen] = useState(false);

  if (session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  return (
    <AuthLayout>
      <div className="col gap-1.5">
        <h1 className="title xl">Connexion</h1>
        <p className="sub">Accès réservé : utilise les identifiants fournis par le bureau.</p>
      </div>
      <LoginForm onForgotPassword={() => setResetOpen((open) => !open)} />
      {resetOpen && <PasswordResetForm />}
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
    <form onSubmit={onSubmit} noValidate className="col gap-4">
      <FormField
        id="email"
        label="E-mail"
        type="email"
        autoComplete="username"
        inputMode="email"
        className="h-12 text-[15px]!"
        error={errors.email?.message}
        {...register('email')}
      />
      <div className="field">
        <div className="row between">
          <Label htmlFor="password">Mot de passe</Label>
          <button type="button" className="link cursor-pointer text-[13px]" onClick={onForgotPassword}>
            Mot de passe oublié
          </button>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          className="h-12 text-[15px]!"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password && (
          <p id="password-error" className="err">
            {errors.password.message}
          </p>
        )}
      </div>
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        <LogIn />
        {isSubmitting ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}

function PasswordResetForm() {
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
    <section className="card col gap-2.5 px-4 py-3.5" aria-labelledby="reset-title">
      <b id="reset-title" className="text-sm">
        Mot de passe oublié
      </b>
      {sentTo ? (
        <p className="row gap-2 text-sm">
          <CircleCheck className="i s shrink-0 text-success" />
          Si un compte existe pour {sentTo}, un e-mail vient d’être envoyé. Pense à vérifier les spams.
        </p>
      ) : (
        <>
          <p className="hint">Tu vas recevoir un lien pour choisir un nouveau mot de passe.</p>
          <form onSubmit={onSubmit} noValidate className="col gap-1.5">
            <div className="row gap-2">
              <Input
                id="reset-email"
                type="email"
                autoComplete="username"
                inputMode="email"
                aria-label="E-mail du compte"
                placeholder="ton.email@rapidtruckservice.fr"
                aria-invalid={errors.email ? true : undefined}
                {...register('email')}
              />
              <Button type="submit" variant="outline" disabled={isSubmitting}>
                {isSubmitting ? 'Envoi…' : 'Envoyer le lien'}
              </Button>
            </div>
            {errors.email && <p className="err">{errors.email.message}</p>}
            {submitError && <p className="err">{submitError}</p>}
          </form>
        </>
      )}
    </section>
  );
}
