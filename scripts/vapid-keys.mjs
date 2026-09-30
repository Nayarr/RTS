// Génère une paire de clés VAPID pour les notifications push (à faire une seule fois).
//
//   node scripts/vapid-keys.mjs
//
// - VAPID_PUBLIC_KEY  : publique, aussi à mettre dans VITE_VAPID_PUBLIC_KEY (Vercel) ;
// - VAPID_PRIVATE_KEY : SECRÈTE, uniquement dans les secrets Supabase (jamais dans Git ni Vercel).
// Changer de clés désabonne tous les appareils : chacun devra réactiver les notifications.
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = Buffer.from(await subtle.exportKey('raw', pair.publicKey)).toString('base64url');
const { d: privateKey } = await subtle.exportKey('jwk', pair.privateKey);

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
