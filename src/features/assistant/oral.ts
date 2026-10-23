// Texte dit à voix haute : écrit pour l'oreille (montants, numéros de documents, dates, heures,
// plaques, sigles), pour la voix du navigateur comme pour la voix Azure.

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** Nombre sans zéros devant : « 00192 » → « 192 ». */
const plain = (digits: string) => String(Number(digits));

/** « 18/10/2026 » → « 18 octobre 2026 », « 01/10 » → « 1er octobre ». */
function spokenDate(day: string, month: string, year?: string): string | null {
  const name = MONTHS[Number(month) - 1];
  const value = Number(day);
  if (!name || value < 1 || value > 31) return null;
  const fullYear = year ? (year.length === 2 ? `20${year}` : year) : '';
  return [value === 1 ? '1er' : String(value), name, fullYear].filter(Boolean).join(' ');
}

/** « 1 250,00 € » → « 1 250 euros », « 12,50 € » → « 12 euros 50 ». */
function spokenAmount(units: string, cents: string | undefined): string {
  const whole = units.replace(/[\s\u00a0\u202f.]/g, ' ').trim();
  const euros = `${whole} euro${whole === '1' || whole === '0' ? '' : 's'}`;
  return cents && Number(cents) > 0 ? `${euros} ${cents.padEnd(2, '0')}` : euros;
}

// Le mot devant le numéro n'est pas répété : « le devis DV07701 » → « le devis 7701 »
const DOCUMENTS: [RegExp, string][] = [
  [/\b(?:devis\s+)?DV0*(\d+)\b/gi, 'devis '],
  [/\bOR0*(\d+)\b/g, 'O R '],
  [/\b(?:avoir\s+)?AV0*(\d+)\b/gi, 'avoir '],
  [/\b(?:facture\s+)?F(\d{3,})\b/gi, 'facture '],
];

const SIGLES: [RegExp, string][] = [
  [/\bHT\b/g, 'hors taxes'],
  [/\bTTC\b/g, 'T T C'],
  [/\bTVA\b/g, 'T V A'],
  [/\bVUL\b/g, 'utilitaire'],
  [/\bPL\b/g, 'poids lourd'],
  [/\bCT\b/g, 'contrôle technique'],
  [/\bN°\s*/g, 'numéro '],
  [/\bkm\b/g, 'kilomètres'],
  [/\bh\b(?=\s|$|[.,;])/g, 'heures'],
];

/**
 * Texte réécrit pour être dit : montants, numéros (DV, OR, F, AV), dates, heures, pourcentages,
 * plaques et sigles. Le reste est gardé tel quel.
 */
export function oralText(text: string): string {
  let out = text;
  // Montants : « 1 250,00 € », « 12,50 € », « 320 € »
  out = out.replace(
    /(\d{1,3}(?:[\s\u00a0\u202f.]\d{3})*|\d+)(?:,(\d{1,2}))?\s?€/g,
    (_, units: string, cents?: string) => spokenAmount(units, cents),
  );
  // Dates : « 18/10/2026 », « 18/10/26 », « 18/10 »
  out = out.replace(
    /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/g,
    (match: string, day: string, month: string, year?: string) => spokenDate(day, month, year) ?? match,
  );
  // Heures : « 08h30 », « 8h », « 14:05 »
  out = out.replace(/\b(\d{1,2})\s?[h:](\d{2})\b/g, (_, hour: string, minutes: string) =>
    minutes === '00' ? `${plain(hour)} heures` : `${plain(hour)} heures ${plain(minutes)}`,
  );
  out = out.replace(/\b(\d{1,2})h\b/g, (_, hour: string) => `${plain(hour)} heures`);
  // Pourcentages
  out = out.replace(/(\d+(?:,\d+)?)\s?%/g, '$1 pour cent');
  // Plaques SIV : « GH-512-RT » → « G H, 512, R T »
  out = out.replace(
    /\b([A-Z]{2})-(\d{3})-([A-Z]{2})\b/g,
    (_, start: string, digits: string, end: string) =>
      `${start.split('').join(' ')}, ${digits}, ${end.split('').join(' ')}`,
  );
  for (const [pattern, word] of DOCUMENTS) {
    out = out.replace(pattern, (_, digits: string) => `${word}${plain(digits)}`);
  }
  for (const [pattern, word] of SIGLES) out = out.replace(pattern, word);
  return out.replace(/\s{2,}/g, ' ').trim();
}
