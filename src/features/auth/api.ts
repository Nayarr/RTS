import { AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { forgetPushSubscription } from '@/features/push/push';
import type { Profile } from './roles';

/** Message d'erreur compréhensible par l'utilisateur. */
export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.code === 'invalid_credentials') return 'Identifiants incorrects.';
    if (error.code === 'user_banned') return 'Ce compte est désactivé. Contacte la direction.';
    if (error.code === 'over_request_rate_limit' || error.status === 429)
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    if (error.code === 'weak_password') return 'Mot de passe trop faible.';
    if (error.code === 'same_password') return 'Le nouveau mot de passe doit être différent de l’ancien.';
  }
  if (error instanceof TypeError) return 'Connexion impossible : vérifie ta connexion internet.';
  return 'Une erreur est survenue. Réessaie ou contacte le bureau.';
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  // Appareil partagé : plus de notifications pour le compte qui se déconnecte.
  await forgetPushSubscription().catch(() => undefined);
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/mot-de-passe/nouveau`,
  });
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Profil applicatif du compte connecté (null si le compte n'a pas de profil). */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
