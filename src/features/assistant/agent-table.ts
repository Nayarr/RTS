import type { AgentTable } from './api';

/** Nom de fichier tiré du titre : « Contrôles techniques » → « controles-techniques.csv ». */
export const tableFileName = (title: string) =>
  `${
    title
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'liste'
  }.csv`;

/** Texte collable dans un tableur (colonnes séparées par des tabulations). */
export const tableText = (table: AgentTable) =>
  [table.colonnes, ...table.lignes]
    .map((row) => row.map((cell) => cell.replace(/\s+/g, ' ')).join('\t'))
    .join('\n');
