/**
 * Texte modifiable d'un e-mail envoyé par l'appli : le lien du document n'est pas dans le texte,
 * il devient un bouton ajouté sous le message (il ne peut donc pas être cassé en modifiant le texte).
 */
export function bodyWithoutLink(body: string, link: string | undefined): string {
  if (!link || !body.includes(link)) return body;
  const lines = body.split('\n');
  const index = lines.findIndex((line) => line.includes(link));
  const rest = (lines[index] ?? '').replace(link, '').trimEnd();
  let target = index;
  if (rest.trim() === '') {
    lines.splice(index, 1);
    target = index - 1;
    while (target >= 0 && (lines[target] ?? '').trim() === '') target--;
  } else {
    lines[index] = rest;
  }
  // « … disponible ici : » ou « … en ligne : » annonçaient le lien : la phrase se termine par un point.
  if (target >= 0) {
    lines[target] = (lines[target] ?? '').replace(/\s*(?:ici\s*)?:\s*$/, '.').replace(/\.\.$/, '.');
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sépare le message de la signature (« Cordialement, … ») : le bouton se place entre les deux. */
export function splitSignature(text: string): [string, string] {
  const at = text.lastIndexOf('\nCordialement');
  if (at < 0) return [text.trim(), ''];
  return [text.slice(0, at).trim(), text.slice(at).trim()];
}
