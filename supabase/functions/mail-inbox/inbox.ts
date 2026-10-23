// Réception d'un mail par Resend : signature du webhook, adresses, texte du message.
import { decodeBase64, encodeBase64 } from '@std/encoding';
import { z } from 'zod';
import { sameSecret } from '../_shared/cron.ts';

/** Au-delà, le texte gardé est coupé (les longues chaînes de réponses citées n'apportent rien). */
export const MAX_BODY_CHARS = 20_000;
/** Écart toléré entre l'horodatage du webhook et l'heure du serveur (rejeu d'un vieux message). */
const TOLERANCE_SECONDS = 5 * 60;

/** Événement « email.received » envoyé par Resend (seuls les champs utiles sont lus). */
export const webhookSchema = z.object({
  type: z.string(),
  data: z
    .object({
      email_id: z.string().min(1).max(200),
      created_at: z.string().optional(),
      message_id: z.string().max(500).nullish(),
      subject: z.string().nullish(),
      from: z.string().max(500),
      to: z.array(z.string()).default([]),
      cc: z.array(z.string()).nullish(),
      attachments: z
        .array(z.object({ filename: z.string().nullish(), content_type: z.string().nullish() }))
        .nullish(),
    })
    .optional(),
});
export type ReceivedEvent = NonNullable<z.infer<typeof webhookSchema>['data']>;

/** Contenu du mail lu à l'API Resend (GET /emails/receiving/{id}). */
export const receivedEmailSchema = z.object({
  text: z.string().nullish(),
  html: z.string().nullish(),
  headers: z.unknown().optional(),
});

/**
 * Signature du webhook (format Svix utilisé par Resend) : HMAC SHA-256 de « id.horodatage.corps »
 * avec le secret « whsec_… » ; l'en-tête peut porter plusieurs signatures « v1,… ».
 */
export async function verifyWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) return false;
  let key: Uint8Array<ArrayBuffer>;
  try {
    key = decodeBase64(secret.replace(/^whsec_/, ''));
  } catch {
    return false;
  }
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  const expected = encodeBase64(new Uint8Array(mac));
  return signature
    .split(' ')
    .some((part) => part.startsWith('v1,') && sameSecret(part.slice(3), expected));
}

/** « Jean Dupont <jean@exemple.fr> » → nom et adresse (adresse en minuscules). */
export function parseAddress(value: string): { name: string; address: string } {
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const name = (match?.[1] ?? '').trim();
  const address = (match?.[2] ?? value).trim().toLowerCase();
  return { name, address };
}

/**
 * Boîte de l'atelier à qui le mail était adressé (première adresse du domaine de l'atelier
 * parmi les destinataires) ; null si le mail ne s'adresse à aucune boîte de l'atelier.
 */
export function atelierMailbox(recipients: readonly string[], domain: string | null): string | null {
  if (!domain) return null;
  const sending = domain.toLowerCase();
  for (const recipient of recipients) {
    for (const part of recipient.split(',')) {
      const { address } = parseAddress(part);
      const host = address.split('@')[1] ?? '';
      // Domaine d'envoi, ou domaine des boîtes quand l'envoi passe par un sous-domaine (send.…)
      if (host && (host === sending || sending.endsWith(`.${host}`))) return address;
    }
  }
  return null;
}

/**
 * Domaine des boîtes de l'atelier : celui réglé dans Réglages › Atelier, sinon celui de l'adresse
 * d'envoi du serveur (secret MAIL_FROM, « RTS <atelier@rapidtruckservice.fr> »).
 */
export function atelierDomain(mailDomain: string | null, mailFrom: string | null | undefined): string | null {
  if (mailDomain) return mailDomain;
  const host = parseAddress(mailFrom ?? '').address.split('@')[1];
  return host || null;
}

/**
 * En-têtes de remise du mail : la boîte de l'atelier y figure même quand elle n'est ni en « À » ni
 * en « Cc » (copie cachée, liste de diffusion, redirecteur o2switch).
 */
export function deliveryRecipients(headers: unknown): string[] {
  // Objet { nom: valeur } ou liste [{ name, value }] selon la version de l'API
  const entries: [string, unknown][] = Array.isArray(headers)
    ? headers.map((
      header: { name?: unknown; value?: unknown },
    ) => [String(header?.name ?? ''), header?.value])
    : headers && typeof headers === 'object'
    ? Object.entries(headers)
    : [];
  const wanted = ['delivered-to', 'x-original-to', 'x-forwarded-to', 'envelope-to', 'to', 'cc'];
  return entries
    .filter(([name]) => wanted.includes(name.toLowerCase()))
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string');
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  euro: '€',
};

const NO_BREAK_SPACE = String.fromCharCode(0xa0);

/** Texte lisible d'un mail envoyé seulement en HTML (balises retirées, rien n'est exécuté). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => ENTITIES[name.toLowerCase()] ?? entity)
    .replaceAll(NO_BREAK_SPACE, ' ');
}

/** Texte gardé : version texte du mail (sinon HTML converti), espaces resserrés, longueur bornée. */
export function mailBody(content: { text?: string | null; html?: string | null }): string {
  const raw = content.text?.trim() ? content.text : htmlToText(content.html ?? '');
  const clean = raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return clean.length > MAX_BODY_CHARS
    ? `${clean.slice(0, MAX_BODY_CHARS - 20).trimEnd()}\n[mail coupé]`
    : clean;
}

/** Adresse utilisable telle quelle dans un filtre « ilike » (casse ignorée, aucun joker). */
export const exactLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);
