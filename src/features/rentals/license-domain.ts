import { z } from 'zod';
import type { DrivingLicense, DrivingLicenseInput, LicenseReading } from './license-api';

/** Catégories du permis européen, dans l'ordre du verso. */
export const ALL_LICENSE_CATEGORIES = [
  'AM',
  'A1',
  'A2',
  'A',
  'B1',
  'B',
  'BE',
  'C1',
  'C1E',
  'C',
  'CE',
  'D1',
  'D1E',
  'D',
  'DE',
] as const;
/** Catégories proposées au comptoir (véhicules qu'un garage poids lourds loue). */
export const COUNTER_CATEGORIES = ['B', 'BE', 'C1', 'C1E', 'C', 'CE'] as const;

/** Le permis couvre-t-il la catégorie demandée ? (mêmes règles que la base) */
export function licenseCovers(categories: readonly string[], required: string): boolean {
  return (
    categories.includes(required) ||
    (required === 'C1' && categories.includes('C')) ||
    ((required === 'C1E' || required === 'BE') && categories.includes('CE')) ||
    (required === 'BE' && categories.includes('C1E'))
  );
}

const frDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

type LicenseFacts = Pick<
  DrivingLicense,
  'recto_file_id' | 'verso_file_id' | 'license_number' | 'categories' | 'valid_until'
>;

/** Ce qui empêche ce permis de servir pour une location jusqu'à `until`, sinon null (comme la base). */
export function licenseBlockReason(license: LicenseFacts, required: string, until: string): string | null {
  if (!license.recto_file_id || !license.verso_file_id) return 'Permis à scanner (recto et verso)';
  if (!license.license_number) return 'Numéro de permis manquant';
  if (!licenseCovers(license.categories, required)) return `Permis ${required} requis`;
  if (license.valid_until && license.valid_until < until) {
    return `Permis expiré le ${frDate(license.valid_until)}`;
  }
  return null;
}

/** État du permis affiché sur les fiches (badge). */
export function licenseState(
  license: Pick<DrivingLicense, 'recto_file_id' | 'verso_file_id' | 'valid_until'>,
  today: string,
): { label: string; tone: string } {
  if (!license.recto_file_id || !license.verso_file_id) return { label: 'À scanner', tone: 's-warn' };
  if (license.valid_until && license.valid_until < today) return { label: 'Expiré', tone: 's-bad' };
  return { label: 'Valide', tone: 's-ok' };
}

const optionalDate = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Date invalide');

export const licenseSchema = z
  .object({
    last_name: z.string().trim().min(1, 'Indique le nom').max(100),
    first_name: z.string().trim().min(1, 'Indique le prénom').max(100),
    birth_date: optionalDate,
    birth_place: z.string().max(100),
    license_number: z
      .string()
      .transform((value) => value.replace(/[\s-]/g, '').toUpperCase())
      .refine(
        (value) => value === '' || /^[A-Z0-9]{6,20}$/.test(value),
        'N° de permis : 6 à 20 lettres ou chiffres',
      ),
    issued_on: optionalDate,
    valid_until: optionalDate,
    categories: z.array(z.enum(ALL_LICENSE_CATEGORIES)),
    recto_file_id: z.string().nullable(),
    verso_file_id: z.string().nullable(),
    read_automatically: z.boolean(),
  })
  .refine((values) => !values.valid_until || !values.issued_on || values.valid_until > values.issued_on, {
    message: 'La fin de validité doit être après la délivrance',
    path: ['valid_until'],
  });
export type LicenseValues = z.input<typeof licenseSchema>;
export type LicenseOutput = z.output<typeof licenseSchema>;

export const emptyLicense = (identity: { first_name?: string; last_name?: string } = {}): LicenseValues => ({
  last_name: identity.last_name ?? '',
  first_name: identity.first_name ?? '',
  birth_date: '',
  birth_place: '',
  license_number: '',
  issued_on: '',
  valid_until: '',
  categories: [],
  recto_file_id: null,
  verso_file_id: null,
  read_automatically: false,
});

export const licenseToForm = (license: DrivingLicense): LicenseValues => ({
  last_name: license.last_name,
  first_name: license.first_name,
  birth_date: license.birth_date ?? '',
  birth_place: license.birth_place ?? '',
  license_number: license.license_number ?? '',
  issued_on: license.issued_on ?? '',
  valid_until: license.valid_until ?? '',
  categories: license.categories.filter((category): category is (typeof ALL_LICENSE_CATEGORIES)[number] =>
    (ALL_LICENSE_CATEGORIES as readonly string[]).includes(category),
  ),
  recto_file_id: license.recto_file_id,
  verso_file_id: license.verso_file_id,
  read_automatically: license.read_automatically,
});

export function licenseFromForm(values: LicenseOutput, clientId: string): DrivingLicenseInput {
  return {
    client_id: clientId,
    last_name: values.last_name.trim(),
    first_name: values.first_name.trim(),
    birth_date: values.birth_date || null,
    birth_place: values.birth_place.trim() || null,
    license_number: values.license_number || null,
    issued_on: values.issued_on || null,
    valid_until: values.valid_until || null,
    categories: ALL_LICENSE_CATEGORIES.filter((category) => values.categories.includes(category)),
    recto_file_id: values.recto_file_id,
    verso_file_id: values.verso_file_id,
    read_automatically: values.read_automatically,
  };
}

/**
 * Champs remplis par la lecture du scan : seuls ceux qui ont été lus remplacent la saisie
 * (le comptoir peut tout corriger ensuite).
 */
export function applyReading(values: LicenseValues, reading: LicenseReading): LicenseValues {
  const read = (value: string | null | undefined, current: string) => (value ? value : current);
  const knownCategories = reading.categories.filter(
    (category): category is (typeof ALL_LICENSE_CATEGORIES)[number] =>
      (ALL_LICENSE_CATEGORIES as readonly string[]).includes(category),
  );
  return {
    ...values,
    last_name: read(reading.last_name, values.last_name),
    first_name: read(reading.first_name, values.first_name),
    birth_date: read(reading.birth_date, values.birth_date),
    birth_place: read(reading.birth_place, values.birth_place),
    license_number: read(reading.license_number, values.license_number),
    issued_on: read(reading.issued_on, values.issued_on),
    valid_until: read(reading.valid_until, values.valid_until),
    categories: knownCategories.length > 0 ? knownCategories : values.categories,
    read_automatically: true,
  };
}

/** Nom lu en majuscules (« MARTIN ») → « Martin » pour la fiche client. */
export const properName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_, separator: string, letter: string) => separator + letter.toUpperCase(),
    );
