// Appels des tâches planifiées (pg_cron → pg_net) : secret partagé dans l'en-tête x-cron-secret.
// Le même secret est rangé dans Vault (cron_secret) et dans les secrets des fonctions (CRON_SECRET).

/** Comparaison en temps constant : la durée ne révèle rien du secret attendu. */
export function sameSecret(received: string, expected: string): boolean {
  const a = new TextEncoder().encode(received);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  return diff === 0;
}

/** Vrai si la requête vient d'une tâche planifiée ; faux si le secret n'est pas configuré. */
export function isCronRequest(req: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  return sameSecret(req.headers.get('x-cron-secret') ?? '', secret);
}
