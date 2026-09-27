// Stockage objet local compatible S3 (remplace Cloudflare R2 en développement et en CI).
//   node scripts/storage.mjs start   → conteneur « rts-storage » sur http://127.0.0.1:9000
//   node scripts/storage.mjs stop
// À lancer après « supabase start » : le conteneur rejoint le réseau Docker de Supabase pour
// que les Edge Functions l'atteignent (http://rts-storage:7070, voir supabase/config.toml).
import { execFileSync } from 'node:child_process';

const CONTAINER = 'rts-storage';
const IMAGE = 'versity/versitygw:v1.8.0';
const NETWORK = 'supabase_network_rts-atelier';
// Identifiants de développement, sans valeur réelle (identiques à supabase/config.toml).
const ACCESS_KEY = 'rts-local-access';
const SECRET_KEY = 'rts-local-secret-key';
const BUCKET = 'rts-atelier';

const docker = (...args) =>
  execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
const remove = () => {
  try {
    docker('rm', '-f', CONTAINER);
  } catch {
    // conteneur absent
  }
};

const command = process.argv[2];
if (command === 'stop') {
  remove();
  console.log('Stockage local arrêté.');
} else if (command === 'start') {
  remove();
  docker(
    'run',
    '-d',
    '--name',
    CONTAINER,
    '--network',
    NETWORK,
    '-p',
    '127.0.0.1:9000:7070',
    '--entrypoint',
    'sh',
    IMAGE,
    '-c',
    `mkdir -p /data/${BUCKET} /meta && exec versitygw --access ${ACCESS_KEY} --secret ${SECRET_KEY} ` +
      `--region auto --cors-allow-origin '*' posix --sidecar /meta /data`,
  );
  // Attente du démarrage (réponse 403 sans signature = service prêt).
  for (let attempt = 0; attempt < 30; attempt++) {
    const ready = await fetch('http://127.0.0.1:9000/').then(
      () => true,
      () => false,
    );
    if (ready) {
      console.log(`Stockage local prêt : http://127.0.0.1:9000 (bucket « ${BUCKET} »).`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.error('Le stockage local ne répond pas : voir « docker logs rts-storage ».');
  process.exit(1);
} else {
  console.error('Usage : node scripts/storage.mjs start|stop');
  process.exit(1);
}
