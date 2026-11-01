// Fichier lu par l'assistant : photo (JPEG, PNG, WebP) ou PDF (carte grise scannée, procès-verbal
// reçu par mail), envoyé comme image ou comme document.

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const PDF_TYPE = 'application/pdf' as const;

/** Bloc de la demande à l'assistant ; null pour un format non lu. */
export function sourceBlock(mimeType: string, data: string) {
  if (mimeType === PDF_TYPE) {
    return { type: 'document' as const, source: { type: 'base64' as const, media_type: PDF_TYPE, data } };
  }
  if (!IMAGE_TYPES.includes(mimeType as ImageType)) return null;
  return {
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: mimeType as ImageType, data },
  };
}
