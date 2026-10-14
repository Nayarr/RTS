// Découpage du texte d'un PDF en passages (environ 1 200 caractères, coupés sur une fin de phrase,
// avec un léger recouvrement pour ne pas perdre une consigne à cheval sur deux passages).

export const CHUNK_SIZE = 1200;
const OVERLAP = 150;
/** Au-delà, le document est coupé (manuel très long) : la direction en est prévenue. */
export const MAX_CHUNKS = 3000;

export interface Chunk {
  page: number;
  position: number;
  content: string;
}

/** Espaces, césures et retours à la ligne du PDF remis à plat. */
export function cleanText(text: string): string {
  return text
    .replace(/-\s*\n\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Passages d'une page : coupés de préférence après un point, sinon sur un espace. */
export function splitPage(text: string, size = CHUNK_SIZE): string[] {
  const clean = cleanText(text);
  if (clean.length <= size) return clean ? [clean] : [];
  const parts: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const sentence = clean.lastIndexOf('. ', end);
      const space = clean.lastIndexOf(' ', end);
      end = sentence > start + size / 2 ? sentence + 1 : space > start + size / 2 ? space : end;
    }
    parts.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - OVERLAP, start + 1);
    // Reprise sur un début de mot
    const next = clean.indexOf(' ', start);
    if (next > 0 && next < end) start = next + 1;
  }
  return parts.filter(Boolean);
}

/** Passages de tout le document, page par page. */
export function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  pages.forEach((text, index) => {
    splitPage(text).forEach((content, position) => chunks.push({ page: index + 1, position, content }));
  });
  return chunks.slice(0, MAX_CHUNKS);
}
