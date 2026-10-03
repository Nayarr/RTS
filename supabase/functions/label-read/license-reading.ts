// Lecture d'un permis de conduire (recto et verso) : consigne envoyée à l'assistant, schéma de
// sa réponse et contrôle des valeurs lues. Le comptoir vérifie avant d'enregistrer.

export const LICENSE_CATEGORIES = [
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
type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];

/** Réponse attendue de l'assistant (sortie JSON imposée par ce schéma). */
export const LICENSE_READING_SCHEMA = {
  type: 'object',
  properties: {
    last_name: { type: 'string', description: 'Nom (rubrique 1), ou chaîne vide si illisible.' },
    first_name: { type: 'string', description: 'Prénom(s) (rubrique 2), ou chaîne vide si illisible.' },
    birth_date: {
      type: 'string',
      description: 'Date de naissance (rubrique 3) au format AAAA-MM-JJ, ou chaîne vide.',
    },
    birth_place: { type: 'string', description: 'Lieu de naissance (rubrique 3), ou chaîne vide.' },
    license_number: {
      type: 'string',
      description: 'Numéro du permis (rubrique 5), sans espace, ou chaîne vide si illisible.',
    },
    issued_on: {
      type: 'string',
      description: 'Date de délivrance du permis (rubrique 4a) au format AAAA-MM-JJ, ou chaîne vide.',
    },
    valid_until: {
      type: 'string',
      description: 'Date de fin de validité du titre (rubrique 4b) au format AAAA-MM-JJ, ou chaîne vide.',
    },
    categories: {
      type: 'array',
      items: { type: 'string', enum: [...LICENSE_CATEGORIES] },
      description: 'Catégories obtenues (verso : lignes avec une date de délivrance en colonne 10).',
    },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
  },
  required: [
    'last_name',
    'first_name',
    'birth_date',
    'birth_place',
    'license_number',
    'issued_on',
    'valid_until',
    'categories',
    'confidence',
  ],
  additionalProperties: false,
} as const;

/** Consigne pour l'assistant. */
export function licenseReadingPrompt(today: string): string {
  return [
    'Ces photos, prises au comptoir d’un garage qui loue des véhicules, montrent le recto puis le verso',
    'd’un permis de conduire (format carte européen, ou ancien permis rose en papier).',
    'Lis l’identité du titulaire, le numéro du permis, ses dates de délivrance et de fin de validité,',
    'et les catégories réellement obtenues (au verso, celles qui ont une date en colonne 10).',
    `Nous sommes le ${today}.`,
    'Donne les dates au format AAAA-MM-JJ, le nom en majuscules tel qu’écrit, le numéro sans espace ;',
    'laisse une chaîne vide (ou une liste vide) pour ce qui est illisible ou absent, sans l’inventer.',
    'confidence : « haute » si tout est net, « moyenne » si une partie est déduite, « faible » si les photos sont floues ou ambiguës.',
  ].join('\n');
}

export interface LicenseReading {
  last_name: string;
  first_name: string;
  birth_date: string;
  birth_place: string;
  license_number: string;
  issued_on: string;
  valid_until: string;
  categories: string[];
  confidence: 'haute' | 'moyenne' | 'faible';
}

const isoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[0]}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0] ? null : match[0];
};

/** Valeurs lues contrôlées : dates plausibles, numéro alphanumérique, catégories connues. */
export function checkedLicense(reading: LicenseReading, today: string) {
  const past = (value: string) => {
    const date = isoDate(value);
    return date && date >= '1900-01-01' && date <= today ? date : null;
  };
  const number = reading.license_number.replace(/[\s-]/g, '').toUpperCase();
  return {
    last_name: reading.last_name.trim(),
    first_name: reading.first_name.trim(),
    birth_date: past(reading.birth_date),
    birth_place: reading.birth_place.trim(),
    license_number: /^[A-Z0-9]{6,20}$/.test(number) ? number : null,
    issued_on: past(reading.issued_on),
    // Un permis expiré reste lu : le comptoir doit le voir
    valid_until: isoDate(reading.valid_until),
    categories: [
      ...new Set(
        reading.categories.filter((category): category is LicenseCategory =>
          (LICENSE_CATEGORIES as readonly string[]).includes(category)
        ),
      ),
    ],
    confidence: reading.confidence,
  };
}
