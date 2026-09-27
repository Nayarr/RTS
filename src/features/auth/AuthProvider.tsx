import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { AuthContext, type AuthState } from './auth-context';

/** Suit la session Supabase (connexion, déconnexion, renouvellement du jeton). */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ session: null, isLoading: true, signedOut: false });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, isLoading: false, signedOut: event === 'SIGNED_OUT' });
      // Changement de compte : on ne garde aucune donnée de l'utilisateur précédent.
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext value={state}>{children}</AuthContext>;
}
