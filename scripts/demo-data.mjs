// Données fictives de démonstration, dans la base LOCALE uniquement.
//
//   npx supabase db reset && npm run db:demo
//
// Charge supabase/demo/demo-data.sql dans le conteneur Postgres local de Supabase
// (jamais en production : aucune adresse distante n'est utilisée). Compte administrateur local :
// le recalage des dates suspend les règles métier (session_replication_role). À lancer sur une base
// fraîchement réinitialisée : le script refuse de s'exécuter deux fois.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const CONTAINER = 'supabase_db_rts-atelier';
const sql = readFileSync(new URL('../supabase/demo/demo-data.sql', import.meta.url));

try {
  const output = execFileSync(
    'docker',
    [
      'exec',
      '-i',
      CONTAINER,
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      '-X',
    ],
    { input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  process.stdout.write(output);
  console.log('Données de démonstration chargées dans la base locale.');
} catch (error) {
  process.stderr.write(error.stderr ?? String(error));
  console.error('\nÉchec : Supabase local démarré ? Base réinitialisée (npx supabase db reset) ?');
  process.exit(1);
}
