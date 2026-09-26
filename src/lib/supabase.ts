import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from './env';

/**
 * Client Supabase unique de l'appli, typé à partir du schéma de la base
 * (src/types/database.ts, régénéré par `npm run db:types`).
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Lien de réinitialisation du mot de passe reçu par e-mail
    detectSessionInUrl: true,
  },
});
