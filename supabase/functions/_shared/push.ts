// Notifications Web Push (standard VAPID, RFC 8291/8292), sans Firebase.
// Clés VAPID au format de « web-push generate-vapid-keys » (base64url) :
//   VAPID_PUBLIC_KEY  : clé publique brute (65 octets), aussi donnée à l'appli (VITE_VAPID_PUBLIC_KEY) ;
//   VAPID_PRIVATE_KEY : clé privée (32 octets), secret des Edge Functions uniquement ;
//   VAPID_SUBJECT     : contact de l'expéditeur (mailto:…), exigé par les services de push.
import { ApplicationServer, PushMessageError, Urgency } from '@negrel/webpush';
import { decodeBase64Url, encodeBase64Url } from '@std/encoding/base64url';

export interface PushConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export interface PushMessage {
  title: string;
  body: string | null;
  link: string | null;
  tag: string | null;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** delivered : reçu par le service de push ; gone : appareil désabonné ; retry : réessayer plus tard. */
export type PushOutcome = 'delivered' | 'gone' | 'retry';

/** Lit la configuration dans les secrets de la fonction ; null si elle est incomplète. */
export function pushConfigFromEnv(env: (name: string) => string | undefined): PushConfig | null {
  const publicKey = env('VAPID_PUBLIC_KEY');
  const privateKey = env('VAPID_PRIVATE_KEY');
  const subject = env('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Paire de clés VAPID (ECDSA P-256) à partir des clés base64url. */
export async function importVapidKeys(config: PushConfig): Promise<CryptoKeyPair> {
  const raw = decodeBase64Url(config.publicKey);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('VAPID_PUBLIC_KEY invalide');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: encodeBase64Url(raw.slice(1, 33)),
    y: encodeBase64Url(raw.slice(33, 65)),
  };
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.importKey('jwk', jwk, algorithm, true, ['verify']),
    crypto.subtle.importKey('jwk', { ...jwk, d: config.privateKey }, algorithm, false, ['sign']),
  ]);
  return { publicKey, privateKey };
}

export async function createPushServer(config: PushConfig): Promise<ApplicationServer> {
  return await ApplicationServer.new({
    contactInformation: config.subject,
    vapidKeys: await importVapidKeys(config),
  });
}

/** Contenu lu par le service worker de l'appli (public/push-sw.js). */
export const pushPayload = (message: PushMessage) =>
  JSON.stringify({
    title: message.title,
    body: message.body ?? '',
    link: message.link ?? '/',
    tag: message.tag,
  });

/** Envoi chiffré à un appareil. Conservé 24 h par le service de push si le téléphone est éteint. */
export async function sendPush(
  server: ApplicationServer,
  target: PushTarget,
  message: PushMessage,
): Promise<PushOutcome> {
  try {
    await server
      .subscribe({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } })
      .pushTextMessage(pushPayload(message), { ttl: 24 * 3600, urgency: Urgency.High });
    return 'delivered';
  } catch (error) {
    if (error instanceof PushMessageError) {
      const status = error.response.status;
      // 404 / 410 : abonnement expiré ou retiré ; 403 : abonnement lié à d'autres clés VAPID.
      if ([403, 404, 410].includes(status)) return 'gone';
    }
    console.error(error);
    return 'retry';
  }
}
