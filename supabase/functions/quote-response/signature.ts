// Signature dessinée par le client sur la page du devis : image PNG envoyée en data URL.

export const MAX_SIGNATURE_BYTES = 1024 * 1024; // même limite que les signatures du bureau

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const DATA_URL_PREFIX = 'data:image/png;base64,';

/** Décode la signature ; null si ce n'est pas une image PNG valide et raisonnable. */
export function decodeSignature(dataUrl: string): Uint8Array<ArrayBuffer> | null {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = Uint8Array.from(atob(dataUrl.slice(DATA_URL_PREFIX.length)), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
  if (bytes.length < PNG_MAGIC.length || bytes.length > MAX_SIGNATURE_BYTES) return null;
  return PNG_MAGIC.every((byte, index) => bytes[index] === byte) ? bytes : null;
}

/** Clé de rangement, même forme que les fichiers envoyés depuis l'appli : signature/AAAA/MM/uuid.png */
export function signatureKey(now: Date, id: string): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `signature/${now.getUTCFullYear()}/${month}/${id}.png`;
}
