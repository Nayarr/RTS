import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface AuthState {
  session: Session | null;
  /** true tant que la session enregistrée sur l'appareil n'a pas été relue. */
  isLoading: boolean;
  /** true si la session vient de se terminer (déconnexion) pendant cette visite. */
  signedOut: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return value;
}
