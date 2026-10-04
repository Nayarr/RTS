// Règles de l'envoi d'un e-mail par Resend : requête du bureau, expéditeur, HTML du message.
import { z } from 'zod';

/** Pièces jointes : 10 Mo au total (contrat avec photos compris). */
export const MAX_ATTACHMENTS_BYTES = 10 * 1024 * 1024;
/** Garde-fou contre un envoi en boucle : e-mails par période de 24 h. */
export const DAILY_LIMIT = 300;

/** Type de message : choisit l'adresse d'envoi (facturation@, atelier@, signature@…). */
export const MAIL_CATEGORIES = ['billing', 'workshop', 'signature'] as const;
export type MailCategory = (typeof MAIL_CATEGORIES)[number];

export const requestSchema = z.object({
  category: z.enum(MAIL_CATEGORIES).default('workshop'),
  to: z.email().max(254),
  subject: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(20_000),
  attachments: z
    .array(
      z.object({
        filename: z
          .string()
          .trim()
          .max(120)
          .regex(/^[^/\\<>:"|?*]+\.pdf$/i),
        content: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/),
      }),
    )
    .max(3)
    .default([]),
  // Même clé pour un nouvel essai : Resend n'envoie pas deux fois le même e-mail.
  idempotency_key: z.guid(),
});
export type MailRequest = z.infer<typeof requestSchema>;

/** Taille réelle (octets) d'un contenu en base64. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export const attachmentsBytes = (attachments: MailRequest['attachments']) =>
  attachments.reduce((total, file) => total + base64Bytes(file.content), 0);

export interface MailSettings {
  mail_domain: string | null;
  mail_billing_local: string;
  mail_workshop_local: string;
  mail_signature_local: string;
}

/**
 * Adresse d'envoi du message : début d'adresse du type de message + domaine des réglages
 * (les réponses reviennent sur cette adresse). Sans domaine réglé : adresse unique du secret
 * MAIL_FROM, réponses vers l'e-mail de l'entreprise. null : rien de configuré.
 */
export function senderFor(
  category: MailCategory,
  settings: MailSettings,
  fallback: { from: string | undefined; replyTo: string | null },
): { address: string; replyTo: string | null } | null {
  if (settings.mail_domain) {
    const local = {
      billing: settings.mail_billing_local,
      workshop: settings.mail_workshop_local,
      signature: settings.mail_signature_local,
    }[category];
    const address = `${local}@${settings.mail_domain}`;
    return { address, replyTo: address };
  }
  return fallback.from ? { address: fallback.from, replyTo: fallback.replyTo } : null;
}

/** Expéditeur affiché « Nom de l'atelier <adresse> » (sans caractère qui casserait l'en-tête). */
export function senderAddress(name: string, address: string): string {
  const clean = name.replace(/["<>\r\n]/g, '').trim();
  return clean ? `${clean} <${address}>` : address;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Version HTML du texte : liens cliquables, retours à la ligne gardés. */
export function textToHtml(text: string): string {
  const body = escapeHtml(text)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\r?\n/g, '<br>\n');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2933">${body}</div>`;
}

/** Corps de la requête à l'API Resend (POST /emails). */
export function resendPayload(
  request: MailRequest,
  sender: { name: string; address: string; replyTo: string | null },
) {
  return {
    from: senderAddress(sender.name, sender.address),
    to: [request.to],
    subject: request.subject,
    text: request.text,
    html: textToHtml(request.text),
    ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
    ...(request.attachments.length
      ? { attachments: request.attachments.map(({ filename, content }) => ({ filename, content })) }
      : {}),
  };
}

/** Message affiché au bureau quand Resend refuse l'envoi. */
export function resendFailure(
  status: number,
  message: string | undefined,
): { status: number; error: string } {
  if (status === 422 || status === 400) {
    return {
      status: 400,
      error: `E-mail refusé par le service d’envoi : ${message ?? 'adresse ou contenu invalide'}`,
    };
  }
  if (status === 429) {
    return { status: 429, error: 'Trop d’e-mails envoyés en peu de temps : réessaie dans une minute' };
  }
  if (status === 401 || status === 403) {
    return { status: 503, error: 'Service d’envoi mal configuré (clé Resend ou domaine non vérifié)' };
  }
  return { status: 502, error: 'Service d’envoi indisponible : réessaie ou passe par ta messagerie' };
}
