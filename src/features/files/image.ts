/** Dimensions réduites pour tenir dans un carré de `max` pixels, proportions conservées. */
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Réduit une photo avant l'envoi (appareil photo d'un téléphone : 4 à 12 Mo → quelques centaines de Ko).
 * Les fichiers qui ne sont pas des photos, ou déjà assez légers, sont envoyés tels quels.
 */
export async function compressImage(
  file: File,
  { maxDimension = 1920, quality = 0.82, keepBelowBytes = 300 * 1024 } = {},
): Promise<File> {
  if (!COMPRESSIBLE.includes(file.type) || file.size <= keepBelowBytes) return file;

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bitmap) return file;
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDimension);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob || blob.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
}
