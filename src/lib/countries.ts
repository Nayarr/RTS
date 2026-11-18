import { z } from 'zod';

// Pays d'un client étranger : codes ISO à deux lettres, noms en français donnés par le navigateur.

/** Pays proposés : Union européenne, voisins et pays d'où viennent le plus souvent les clients. */
const CODES = [
  'DE',
  'AT',
  'BE',
  'BG',
  'CY',
  'HR',
  'DK',
  'ES',
  'EE',
  'FI',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'CZ',
  'RO',
  'SK',
  'SI',
  'SE',
  'AD',
  'CH',
  'GB',
  'MC',
  'NO',
  'LI',
  'IS',
  'RS',
  'BA',
  'AL',
  'MK',
  'ME',
  'UA',
  'MD',
  'TR',
  'MA',
  'DZ',
  'TN',
  'SN',
  'CI',
  'US',
  'CA',
];

const names = (() => {
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** « BE » → « Belgique » (le code tel quel si le navigateur ne connaît pas le pays). */
export const countryName = (code: string | null | undefined) => (code ? (names?.of(code) ?? code) : '');

/** Pays proposés, dans l'ordre alphabétique de leur nom. */
export const FOREIGN_COUNTRIES: { value: string; label: string }[] = CODES.map((code) => ({
  value: code,
  label: countryName(code),
})).sort((a, b) => a.label.localeCompare(b.label, 'fr'));

/** Client étranger : pays renseigné et différent de la France. */
export const isForeign = (country: string | null | undefined) => Boolean(country) && country !== 'FR';

/** Ligne imprimée sur les documents : « N° d'entreprise BE 0123.456.789 (Belgique) » ; null sans n°. */
export function foreignIdLine(country: string | null | undefined, foreignId: string | null | undefined) {
  if (!isForeign(country) || !foreignId?.trim()) return null;
  return `N° d’entreprise ${foreignId.trim()} (${countryName(country)})`;
}

/** N° d'entreprise d'un client étranger : facultatif, 2 à 40 caractères. */
export const foreignIdField = z
  .string()
  .trim()
  .refine((value) => value === '' || value.length >= 2, 'N° trop court')
  .refine((value) => value.length <= 40, '40 caractères au maximum');
