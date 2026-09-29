import { z } from 'zod';

/**
 * Variables d'environnement du navigateur, validées au démarrage.
 * Une variable manquante fait échouer l'appli immédiatement avec un message clair,
 * plutôt que des erreurs incompréhensibles plus tard.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.url({ message: 'VITE_SUPABASE_URL doit être une URL' }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20, 'VITE_SUPABASE_PUBLISHABLE_KEY est manquante'),
  // Facultative : sans elle, l'activation des notifications push n'est pas proposée.
  VITE_VAPID_PUBLIC_KEY: z
    .string()
    .optional()
    .transform((key) => key?.trim() || undefined),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `- ${issue.message}`).join('\n');
  throw new Error(`Configuration de l'appli incomplète (voir .env.example) :\n${details}`);
}

export const env = parsed.data;
