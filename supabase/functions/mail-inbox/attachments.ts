// Pièces jointes d'un mail reçu : choisies, téléchargées chez Resend et lues par le tri (Haiku).
//
// Seuls les PDF et les photos sont lus (facture, devis, contrôle technique, photo d'une panne…),
// dans une limite de taille qui borne le coût du tri. Les images insérées dans le texte (logo,
// signature) sont ignorées. Les fichiers ne sont pas gardés : seul le résumé de chacun l'est.
import { encodeBase64 } from '@std/encoding';
import { z } from 'zod';

/** Pièces jointes lues par mail au plus (les suivantes sont seulement nommées au tri). */
export const MAX_READ_FILES = 3;
/** Taille au-delà de laquelle un fichier n'est pas lu (un PDF de quelques pages pèse bien moins). */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Taille cumulée des fichiers lus pour un mail. */
export const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** Pièce jointe listée par Resend (GET /emails/receiving/{id}/attachments). */
export const attachmentListSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string(),
        filename: z.string().nullish(),
        size: z.number().nullish(),
        content_type: z.string().nullish(),
        content_disposition: z.string().nullish(),
        content_id: z.string().nullish(),
        download_url: z.string().url(),
      }),
    )
    .default([]),
});
export type ListedAttachment = z.infer<typeof attachmentListSchema>['data'][number];

/** Type lisible par le tri : PDF ou image, d'après le type annoncé puis l'extension du fichier. */
export function readableKind(file: Pick<ListedAttachment, 'filename' | 'content_type'>):
  | { kind: 'pdf' }
  | { kind: 'image'; mediaType: ImageType }
  | null {
  const type = (file.content_type ?? '').toLowerCase().split(';')[0].trim();
  const name = (file.filename ?? '').toLowerCase();
  if (type === 'application/pdf' || (!type.startsWith('image/') && name.endsWith('.pdf'))) {
    return { kind: 'pdf' };
  }
  if ((IMAGE_TYPES as readonly string[]).includes(type)) {
    return { kind: 'image', mediaType: type as ImageType };
  }
  if (type === 'image/jpg') return { kind: 'image', mediaType: 'image/jpeg' };
  const byName: [RegExp, ImageType][] = [
    [/\.jpe?g$/, 'image/jpeg'],
    [/\.png$/, 'image/png'],
    [/\.gif$/, 'image/gif'],
    [/\.webp$/, 'image/webp'],
  ];
  if (!type || type === 'application/octet-stream') {
    const found = byName.find(([pattern]) => pattern.test(name));
    if (found) return { kind: 'image', mediaType: found[1] };
  }
  return null;
}

/**
 * Pièces jointes à lire : PDF et photos, hors images insérées dans le texte (logo, signature),
 * de taille raisonnable, trois au plus et 10 Mo en tout.
 */
export function pickReadable(files: readonly ListedAttachment[]): ListedAttachment[] {
  const picked: ListedAttachment[] = [];
  let total = 0;
  for (const file of files) {
    if (picked.length >= MAX_READ_FILES) break;
    if (!readableKind(file)) continue;
    if ((file.content_disposition ?? '').toLowerCase() === 'inline' && file.content_id) continue;
    const size = file.size ?? 0;
    if (size <= 0 || size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) continue;
    picked.push(file);
    total += size;
  }
  return picked;
}

/** Fichier téléchargé, prêt à être joint à la demande de tri. */
export interface ReadFile {
  filename: string;
  bytes: Uint8Array;
  kind: NonNullable<ReturnType<typeof readableKind>>;
}

/** Bloc de contenu de l'API Anthropic pour un fichier (document PDF ou image, en base64). */
export function contentBlock(file: ReadFile) {
  const data = encodeBase64(file.bytes);
  return file.kind.kind === 'pdf'
    ? {
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data },
      title: file.filename.slice(0, 200),
    }
    : {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: file.kind.mediaType, data },
    };
}

/**
 * Résumés rendus par le tri, rangés sur les pièces jointes gardées avec le mail (par nom de
 * fichier ; un fichier non lu garde seulement son nom et son type).
 */
export function withSummaries<T extends { filename?: string | null }>(
  attachments: readonly T[],
  summaries: readonly { fichier: string; resume: string }[],
): (T & { summary?: string })[] {
  const byName = new Map(summaries.map((item) => [item.fichier.trim().toLowerCase(), item.resume.trim()]));
  return attachments.map((file) => {
    const summary = byName.get((file.filename ?? '').trim().toLowerCase());
    return summary ? { ...file, summary } : { ...file };
  });
}

/**
 * Lien de téléchargement accepté : en https chez Resend (lien signé de son CDN), ou chez l'API
 * réglée par RESEND_API_URL (serveur de test). Rien d'autre n'est appelé avec un lien reçu.
 */
export function trustedDownload(url: string, apiUrl: string): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  const api = new URL(apiUrl);
  if (target.host === api.host && target.protocol === api.protocol) return true;
  return target.protocol === 'https:' &&
    (target.hostname === 'resend.com' || target.hostname.endsWith('.resend.com'));
}
