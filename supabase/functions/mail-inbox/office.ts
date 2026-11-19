// Texte des pièces jointes Word (.docx), Excel (.xlsx) et CSV : l'API ne lit que les PDF et les
// images, la fonction extrait donc elle-même le texte de ces fichiers avant de le joindre au tri.
// Les anciens formats binaires (.doc, .xls) ne sont pas lus : seul leur nom est donné au tri.
import { unzipSync } from 'fflate';

/** Texte lu par fichier au plus (environ 10 000 jetons) : la suite n'est pas envoyée au tri. */
export const MAX_TEXT_CHARS = 30_000;
/** Taille décompressée au-delà de laquelle une partie du fichier n'est pas ouverte (archive piégée). */
export const MAX_UNZIPPED_BYTES = 20 * 1024 * 1024;
/** Lignes lues par feuille Excel au plus. */
export const MAX_SHEET_ROWS = 500;

const TRUNCATED = '\n[… suite du fichier non lue]';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Caractères XML échappés rendus tels quels (&amp;, &#233;, &#xE9;…). */
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Texte coupé à la limite, avec une marque de coupure. */
export function clip(text: string, max = MAX_TEXT_CHARS): string {
  const clean = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return clean.length > max ? clean.slice(0, max) + TRUNCATED : clean;
}

/** Parties choisies d'un fichier Office (archive zip), décodées en texte ; null si illisible. */
function unzipText(bytes: Uint8Array, keep: (name: string) => boolean): Map<string, string> | null {
  try {
    const files = unzipSync(bytes, {
      filter: (file) => keep(file.name) && file.originalSize <= MAX_UNZIPPED_BYTES,
    });
    const decoder = new TextDecoder();
    return new Map(Object.entries(files).map(([name, data]) => [name, decoder.decode(data)]));
  } catch {
    return null;
  }
}

/** Texte d'un document Word : paragraphes dans l'ordre, tableaux compris. */
export function docxText(bytes: Uint8Array): string | null {
  const xml = unzipText(bytes, (name) => name === 'word/document.xml')?.get('word/document.xml');
  if (!xml) return null;
  // Tableaux : une ligne par rangée, cellules séparées par « | » (comme un tableur)
  const flat = xml.replace(
    /<w:tbl>[\s\S]*?<\/w:tbl>/g,
    (table) =>
      (table.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? [])
        .map((row) => {
          // Morceaux d'un paragraphe collés (Word coupe parfois un mot), paragraphes d'une cellule espacés
          const cells = (row.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? []).map((cell) =>
            (cell.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [])
              .map((paragraph) =>
                [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(
                  '',
                )
              )
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
          );
          return `<w:p><w:r><w:t>${cells.join(' | ')}</w:t></w:r></w:p>`;
        })
        .join(''),
  );
  const paragraphs = flat.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  const lines = paragraphs.map((paragraph) => {
    // Tabulations et sauts de ligne gardés à leur place dans le texte
    const marked = paragraph.replace(/<w:tab\/>/g, '<w:t>\t</w:t>').replace(/<w:br\/>/g, '<w:t>\n</w:t>');
    return decodeXml(
      [...marked.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => match[1]).join(''),
    );
  });
  const text = clip(lines.join('\n'));
  return text || null;
}

/** « B12 » → 1 (colonne B, à partir de 0). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? 'A';
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** Texte d'une cellule `<t>` (texte simple ou enrichi). */
const runsText = (xml: string) =>
  decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join(''));

/**
 * Texte d'un classeur Excel : chaque feuille avec son nom, une ligne par rangée, cellules séparées
 * par « | » (colonnes vides gardées). Les dates restent en nombre de jours (format Excel).
 */
export function xlsxText(bytes: Uint8Array): string | null {
  const parts = unzipText(
    bytes,
    (name) =>
      name === 'xl/workbook.xml' || name === 'xl/sharedStrings.xml' ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );
  if (!parts) return null;
  const shared = [...(parts.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((
    match,
  ) => runsText(match[1]));
  const names = [...(parts.get('xl/workbook.xml') ?? '').matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((
    match,
  ) => decodeXml(match[1]));
  const sheets = [...parts.keys()]
    .filter((name) => name.startsWith('xl/worksheets/'))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]));

  const blocks: string[] = [];
  sheets.forEach((sheet, sheetIndex) => {
    const xml = parts.get(sheet) ?? '';
    const rows: string[] = [];
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= MAX_SHEET_ROWS) {
        rows.push('[… lignes suivantes non lues]');
        break;
      }
      const cells: string[] = [];
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attributes = cell[1];
        const content = cell[2] ?? '';
        const ref = /\br="([A-Z]+\d+)"/i.exec(attributes)?.[1];
        const type = /\bt="(\w+)"/.exec(attributes)?.[1];
        const raw = /<v>([\s\S]*?)<\/v>/.exec(content)?.[1];
        let value = '';
        if (type === 's' && raw !== undefined) value = shared[Number(raw)] ?? '';
        else if (type === 'inlineStr') value = runsText(content);
        else if (type === 'b' && raw !== undefined) value = raw === '1' ? 'VRAI' : 'FAUX';
        else if (raw !== undefined) value = decodeXml(raw);
        const index = ref ? columnIndex(ref) : cells.length;
        while (cells.length < index) cells.push('');
        cells[index] = value.replace(/\s+/g, ' ').trim();
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) rows.push(cells.join(' | '));
    }
    if (rows.length) {
      blocks.push(`Feuille « ${names[sheetIndex] ?? `Feuille ${sheetIndex + 1}`} »\n${rows.join('\n')}`);
    }
  });
  const text = clip(blocks.join('\n\n'));
  return text || null;
}

/** Texte d'un fichier CSV ou texte : UTF-8, sinon Windows-1252 (export d'un vieux logiciel). */
export function plainText(bytes: Uint8Array): string | null {
  let text = new TextDecoder('utf-8').decode(bytes);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(bytes);
  const clean = clip(text.replace(/^﻿/, '').replace(/\r\n?/g, '\n'));
  return clean || null;
}
