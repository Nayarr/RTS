// Pièces jointes d'un mail reçu : choisies, téléchargées chez Resend et lues par le tri (Haiku).
//
// Sont lus les PDF et les photos (facture, devis, contrôle technique, photo d'une panne…), et le
// texte des Word, Excel et CSV (extrait ici : office.ts), dans une limite de taille qui borne le
// coût du tri. Les images insérées dans le texte (logo,
// signature) sont ignorées. Les fichiers ne sont pas gardés : seul le résumé de chacun l'est.
import { encodeBase64 } from '@std/encoding';
import { z } from 'zod';
import { docxText, plainText, xlsxText } from './office.ts';

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

/** Fichiers dont le texte est extrait par la fonction (l'API ne les lit pas). */
export type TextKind = 'docx' | 'xlsx' | 'text';

const TEXT_TYPES: Record<string, TextKind> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'text',
  'application/csv': 'text',
  'text/plain': 'text',
};
const TEXT_EXTENSIONS: [RegExp, TextKind][] = [
  [/\.docx$/, 'docx'],
  [/\.xlsx$/, 'xlsx'],
  [/\.(csv|txt)$/, 'text'],
];

/**
 * Type lisible par le tri, d'après le type annoncé puis l'extension du fichier : PDF ou image (lus
 * par l'API), Word, Excel ou CSV (texte extrait par la fonction).
 */
export function readableKind(file: Pick<ListedAttachment, 'filename' | 'content_type'>):
  | { kind: 'pdf' }
  | { kind: 'image'; mediaType: ImageType }
  | { kind: TextKind }
  | null {
  const type = (file.content_type ?? '').toLowerCase().split(';')[0].trim();
  const name = (file.filename ?? '').toLowerCase();
  if (type === 'application/pdf' || (!type.startsWith('image/') && name.endsWith('.pdf'))) {
    return { kind: 'pdf' };
  }
  const textKind = TEXT_TYPES[type];
  if (textKind) {
    // Texte annoncé : CSV ou .txt seulement (pas de page HTML enregistrée en texte)
    if (textKind !== 'text' || /\.(csv|txt)$/.test(name) || type !== 'text/plain') return { kind: textKind };
  }
  if (!type.startsWith('image/')) {
    const found = TEXT_EXTENSIONS.find(([pattern]) => pattern.test(name));
    if (found) return { kind: found[1] };
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
  /** Word, Excel, CSV : texte extrait du fichier. */
  text?: string;
}

/** Texte d'un Word, d'un Excel ou d'un CSV ; null si le fichier est illisible ou vide. */
export function extractText(kind: TextKind, bytes: Uint8Array): string | null {
  if (kind === 'docx') return docxText(bytes);
  if (kind === 'xlsx') return xlsxText(bytes);
  return plainText(bytes);
}

/**
 * Bloc de contenu de l'API Anthropic pour un fichier : document PDF ou image en base64, ou document
 * texte pour un Word, un Excel ou un CSV.
 */
export function contentBlock(file: ReadFile) {
  const title = file.filename.slice(0, 200);
  if (file.kind.kind !== 'pdf' && file.kind.kind !== 'image') {
    return {
      type: 'document' as const,
      source: { type: 'text' as const, media_type: 'text/plain' as const, data: file.text ?? '' },
      title,
    };
  }
  const data = encodeBase64(file.bytes);
  return file.kind.kind === 'pdf'
    ? {
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data },
      title,
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
