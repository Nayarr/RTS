/**
 * Export CSV lisible par Excel en français : séparateur « ; », virgule décimale,
 * BOM UTF-8 pour les accents.
 */
const BOM = String.fromCharCode(0xfeff);

export type CsvCell = string | number | null | undefined;

const cell = (value: CsvCell) => {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? value.toFixed(2).replace('.', ',') : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (headers: string[], rows: CsvCell[][]) =>
  `${BOM}${[headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`;

/** Téléchargement d'un fichier généré dans le navigateur. */
export function downloadFile(content: string, fileName: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
