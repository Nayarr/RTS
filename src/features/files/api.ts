import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type FileCategory = Database['public']['Enums']['file_category'];

interface UploadTicket {
  file_id: string;
  upload_url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/** Type d'un document PDF (contrôle technique, carte grise, permis…), lu par l'assistant comme une photo. */
export const PDF_TYPE = 'application/pdf';

/**
 * Envoie un fichier dans R2 en trois temps : réservation (droits vérifiés en base),
 * envoi direct du navigateur vers R2 avec l'URL signée, puis confirmation.
 * Renvoie l'identifiant du fichier, à enregistrer sur la fiche concernée (OR, logo…).
 */
export async function uploadFile(
  file: Blob,
  { category, name }: { category: FileCategory; name?: string },
): Promise<string> {
  const ticket = await invokeFunction<UploadTicket>('files', {
    action: 'upload',
    category,
    mime_type: file.type,
    size_bytes: file.size,
    original_name: name ?? (file instanceof File ? file.name : null),
  });

  const response = await fetch(ticket.upload_url, {
    method: ticket.method,
    headers: ticket.headers,
    body: file,
  }).catch(() => null);
  if (!response?.ok) throw new Error('Envoi du fichier impossible : vérifie ta connexion internet');

  await invokeFunction('files', { action: 'confirm', file_id: ticket.file_id });
  return ticket.file_id;
}

/** Type d'un fichier enregistré (image ou PDF), null s'il n'est pas lisible. */
export async function fetchFileMimeType(fileId: string): Promise<string | null> {
  const { data, error } = await supabase.from('files').select('mime_type').eq('id', fileId).maybeSingle();
  if (error) throw error;
  return data?.mime_type ?? null;
}

/** URL de lecture temporaires (1 h) ; les fichiers non autorisés sont absents du résultat. */
export async function fetchFileUrls(
  fileIds: string[],
  disposition: 'inline' | 'attachment' = 'inline',
): Promise<Record<string, string>> {
  if (fileIds.length === 0) return {};
  const { urls } = await invokeFunction<{ urls: Record<string, string> }>('files', {
    action: 'download',
    file_ids: fileIds,
    disposition,
  });
  return urls;
}
