/** Photo affichée dans la visionneuse. */
export interface ViewerPhoto {
  id: string;
  url: string | null;
  label: string;
  takenAt?: string | null | undefined;
  author?: string | null | undefined;
}

/** « Face avant » → « face-avant » (sans accents ni caractères interdits dans un nom de fichier). */
export const fileSlug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Nom du fichier téléchargé : « FQ-289-FJ_face-avant.jpg ». Plusieurs photos au même libellé
 * (« Pièces ») : numéro ajouté pour ne pas écraser la précédente.
 */
export function photoFileName(
  plate: string | null | undefined,
  photos: ViewerPhoto[],
  index: number,
): string {
  const photo = photos[index];
  const label = fileSlug(photo?.label ?? 'photo') || 'photo';
  const same = photos.filter((item) => item.label === photo?.label);
  const rank = same.findIndex((item) => item.id === photo?.id) + 1;
  const prefix = plate ? `${plate.toUpperCase().replace(/\s+/g, '')}_` : '';
  return `${prefix}${label}${same.length > 1 ? `-${rank}` : ''}.jpg`;
}

/** Photo suivante ou précédente, en boucle. */
export const wrapIndex = (index: number, count: number) =>
  count === 0 ? 0 : ((index % count) + count) % count;
