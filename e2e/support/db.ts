import { execFileSync } from 'node:child_process';

// Base locale de Supabase (conteneur Docker du projet « rts-atelier »), pour les traitements
// réservés aux tâches planifiées (pg_cron) que l'appli ne peut pas lancer elle-même.
const DB_CONTAINER = 'supabase_db_rts-atelier';

/** Requête SQL sur la base locale (droits du propriétaire) ; renvoie le texte brut du résultat. */
export function sql(query: string): string {
  return execFileSync('docker', ['exec', DB_CONTAINER, 'psql', '-U', 'postgres', '-tAc', query], {
    encoding: 'utf8',
  }).trim();
}
