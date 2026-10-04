import type { PdfFile } from '@/components/PdfPreviewDialog';
import { invokeFunction } from './functions';
import type { SendLinkMessage } from './send-links';
import { supabase } from './supabase';

export const mailSendEnabledKey = ['settings', 'mail-send-enabled'] as const;

/** Réglage de la direction : les e-mails partent directement par l'appli (Resend). */
export async function fetchMailSendEnabled(): Promise<boolean> {
  const { data, error } = await supabase.from('app_settings').select('mail_send_enabled').maybeSingle();
  if (error) throw error;
  return data?.mail_send_enabled ?? false;
}

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
  to: string;
  message: SendLinkMessage;
  attachments: PdfFile[];
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const attachments = await Promise.all(
    input.attachments.map(async (file) => ({
      filename: file.fileName,
      content: await blobToBase64(file.blob),
    })),
  );
  return invokeFunction<{ id: string }>('mail-send', {
    to: input.to.trim(),
    subject: input.message.subject,
    text: input.message.body,
    attachments,
    idempotency_key: input.idempotencyKey,
  });
}
