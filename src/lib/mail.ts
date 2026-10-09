import type { PdfFile } from '@/components/PdfPreviewDialog';
import { invokeFunction } from './functions';
import { supabase } from './supabase';

export const mailSettingsKey = ['settings', 'mail'] as const;

/** Type de message : choisit l'adresse d'envoi (facturation@, atelier@, signature@…). */
export type MailCategory = 'billing' | 'workshop' | 'signature';

export interface MailSettings {
  /** Réglage de la direction : les e-mails partent directement par l'appli (Resend). */
  enabled: boolean;
  /** Domaine d'envoi vérifié chez Resend (null : adresse unique du secret MAIL_FROM). */
  domain: string | null;
  locals: Record<MailCategory, string>;
  /** Nom de l'atelier (expéditeur affiché) et e-mail de l'entreprise (réponses sans domaine réglé). */
  companyName: string;
  companyEmail: string | null;
}

export async function fetchMailSettings(): Promise<MailSettings> {
  const [app, company] = await Promise.all([
    supabase
      .from('app_settings')
      .select('mail_send_enabled, mail_domain, mail_billing_local, mail_workshop_local, mail_signature_local')
      .maybeSingle(),
    supabase.from('company_settings').select('legal_name, email').maybeSingle(),
  ]);
  if (app.error) throw app.error;
  if (company.error) throw company.error;
  const data = app.data;
  return {
    enabled: data?.mail_send_enabled ?? false,
    domain: data?.mail_domain ?? null,
    locals: {
      billing: data?.mail_billing_local ?? 'facturation',
      workshop: data?.mail_workshop_local ?? 'atelier',
      signature: data?.mail_signature_local ?? 'signature',
    },
    companyName: company.data?.legal_name ?? '',
    companyEmail: company.data?.email ?? null,
  };
}

/** Adresse qui enverra le message (null : adresse unique réglée côté serveur). */
export const mailSender = (category: MailCategory, settings: MailSettings) =>
  settings.domain ? `${settings.locals[category]}@${settings.domain}` : null;

/** Contenu d'un fichier en base64 (par blocs : pas de dépassement de pile sur un gros PDF). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

/**
 * Envoi par l'appli : le message préparé part au nom de l'atelier, avec les PDF joints.
 * `idempotencyKey` : la même clé pour un nouvel essai, le client ne reçoit pas deux fois l'e-mail.
 */
export async function sendMail(input: {
  category: MailCategory;
  to: string;
  /** Objet et texte relus (et éventuellement modifiés) dans l'aperçu. */
  subject: string;
  text: string;
  /** Lien du document : bouton ajouté sous le message. */
  link?: { label: string; url: string } | undefined;
  attachments: PdfFile[];
  idempotencyKey: string;
  /** Réponse à un mail reçu (Agent Direction) : même fil chez le client, mail marqué répondu. */
  inboxEmailId?: string | undefined;
}): Promise<{ id: string }> {
  const attachments = await Promise.all(
    input.attachments.map(async (file) => ({
      filename: file.fileName,
      content: await blobToBase64(file.blob),
    })),
  );
  return invokeFunction<{ id: string }>('mail-send', {
    category: input.category,
    to: input.to.trim(),
    subject: input.subject.trim(),
    text: input.text.trim(),
    ...(input.link ? { link: input.link } : {}),
    attachments,
    idempotency_key: input.idempotencyKey,
    ...(input.inboxEmailId ? { inbox_email_id: input.inboxEmailId } : {}),
  });
}
