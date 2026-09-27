import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** Appelle une Edge Function et remonte son message d'erreur (en français) tel quel. */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const response = await supabase.functions.invoke<T>(name, { body });
  const error: unknown = response.error;
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? 'Opération impossible');
    }
    throw new Error('Serveur injoignable : vérifie ta connexion internet');
  }
  return response.data as T;
}
