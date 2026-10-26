// N° de TVA : forme enregistrée, pays de l'Union européenne (vérifiés par VIES), format ailleurs.
import { z } from 'zod';

/** Préfixes de l'Union européenne (Grèce « EL », Irlande du Nord « XI »), comme la base. */
export const EU_PREFIXES = [
  'AT',
  'BE',
  'BG',
  'CY',
  'CZ',
  'DE',
  'DK',
  'EE',
  'EL',
  'ES',
  'FI',
  'FR',
  'HR',
  'HU',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SE',
  'SI',
  'SK',
  'XI',
];

/** « fr 66 984.989.137 » → « FR66984989137 » ; « CHE-123.456.789 MWST » → « CHE123456789MWST ». */
export const normalizeVat = (value: string) => value.toUpperCase().replace(/[^0-9A-Z]/g, '');

/** Format attendu des principaux pays hors Union européenne ; sinon préfixe pays et 2 à 15 caractères. */
const OTHER_FORMATS: Record<string, RegExp> = {
  GB: /^GB(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/,
  CH: /^CHE\d{9}(MWST|TVA|IVA)?$/,
  NO: /^NO\d{9}(MVA)?$/,
};

export const isEuVat = (vat: string) => EU_PREFIXES.includes(vat.slice(0, 2));

export function formatOk(vat: string): boolean {
  if (!/^[A-Z]{2}[0-9A-Z]{2,15}$/.test(vat)) return false;
  const known = OTHER_FORMATS[vat.slice(0, 2)];
  return known ? known.test(vat) : true;
}

export const requestSchema = z.object({
  vat_number: z.string().trim().min(4).max(30),
  client_id: z.guid().optional(),
});

export type VatStatus = 'valid' | 'format' | 'invalid' | 'unavailable';

export interface VatResult {
  vat_number: string;
  status: VatStatus;
  name: string | null;
}

/** Réponse de VIES (service de la Commission européenne) : n° reconnu ou non, raison sociale. */
export const viesSchema = z.object({
  valid: z.boolean(),
  name: z.string().nullish(),
});

/** Corps de la demande à VIES : pays et numéro sans le préfixe. */
export const viesRequest = (vat: string) => ({ countryCode: vat.slice(0, 2), vatNumber: vat.slice(2) });

/** Raison sociale lisible (« --- » quand le pays ne la communique pas). */
export const registeredName = (name: string | null | undefined) =>
  name && name.trim() && !/^-+$/.test(name.trim()) ? name.trim() : null;
