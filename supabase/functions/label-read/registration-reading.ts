// Lecture d'une carte grise (certificat d'immatriculation) pour remplir la fiche d'un véhicule de
// la flotte : consigne envoyée à l'assistant, schéma de sa réponse et contrôle des valeurs lues.
// Le comptoir vérifie avant d'enregistrer.
import { validPlate, validVin } from './inspection-reading.ts';

/** Réponse attendue de l'assistant (sortie JSON imposée par ce schéma). */
export const REGISTRATION_READING_SCHEMA = {
  type: 'object',
  properties: {
    plate: { type: 'string', description: 'Immatriculation (rubrique A), ou chaîne vide si illisible.' },
    first_registration: {
      type: 'string',
      description: 'Date de première immatriculation (rubrique B) au format AAAA-MM-JJ, ou chaîne vide.',
    },
    brand: { type: 'string', description: 'Marque (rubrique D.1), ou chaîne vide.' },
    model: {
      type: 'string',
      description: 'Dénomination commerciale (rubrique D.3), sinon type (D.2), ou chaîne vide.',
    },
    vin: {
      type: 'string',
      description: 'Numéro d’identification du véhicule (rubrique E, 17 caractères), ou chaîne vide.',
    },
    genre: {
      type: 'string',
      description: 'Genre national (rubrique J.1 : VP, CTTE, CAM, TRR, SREM, REM…), ou chaîne vide.',
    },
    energy: {
      type: 'string',
      description: 'Source d’énergie (rubrique P.3 : GO, ES, EL, EH, GN…), ou chaîne vide.',
    },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
  },
  required: ['plate', 'first_registration', 'brand', 'model', 'vin', 'genre', 'energy', 'confidence'],
  additionalProperties: false,
} as const;

export function registrationReadingPrompt(today: string): string {
  return [
    'Cette photo, prise au comptoir d’un garage poids lourds, montre une carte grise française',
    '(certificat d’immatriculation) d’un véhicule à ajouter à sa flotte de location.',
    'Lis l’immatriculation (A), la date de première immatriculation (B), la marque (D.1),',
    'la dénomination commerciale (D.3, sinon le type D.2), le VIN (E, aussi appelé « numéro de série »),',
    'le genre national (J.1) et la source d’énergie (P.3).',
    `Nous sommes le ${today}.`,
    'Donne la date au format AAAA-MM-JJ et le VIN sans espace ; laisse une chaîne vide pour ce qui est illisible ou absent, sans l’inventer.',
    'confidence : « haute » si tout est net, « moyenne » si une partie est déduite, « faible » si la photo est floue ou ambiguë.',
  ].join('\n');
}

export interface RegistrationReading {
  plate: string;
  first_registration: string;
  brand: string;
  model: string;
  vin: string;
  genre: string;
  energy: string;
  confidence: 'haute' | 'moyenne' | 'faible';
}

/** Catégorie de la flotte d'après le genre national (J.1). */
export function fleetCategory(genre: string): 'tractor' | 'trailer' | 'van' | 'car' | null {
  const value = genre.replace(/[\s.]/g, '').toUpperCase();
  if (value === 'TRR' || value === 'TRA') return 'tractor';
  if (['SREM', 'REM', 'SRTC', 'RETC', 'SRSP', 'RESP'].includes(value)) return 'trailer';
  if (['CTTE', 'CAM', 'VTSU', 'VASP', 'DERIVVP'].includes(value)) return 'van';
  if (value === 'VP') return 'car';
  return null;
}

/** Carburant de la fiche d'après la source d'énergie (P.3). */
export function fuelType(energy: string): 'Gazole' | 'Essence' | 'Électrique' | 'Hybride' | 'GNV' | null {
  const value = energy.replace(/\s/g, '').toUpperCase();
  if (value === 'GO' || value === 'GAZOLE') return 'Gazole';
  if (value === 'ES' || value === 'ESSENCE') return 'Essence';
  if (value === 'EL') return 'Électrique';
  if (['EH', 'EE', 'GH', 'GL', 'GE', 'HE', 'HH'].includes(value)) return 'Hybride';
  if (['GN', 'GZ', 'NG'].includes(value)) return 'GNV';
  return null;
}

const isoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[0]}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== match[0] ? null : match[0];
};

/** Valeurs lues contrôlées : plaque, VIN et date plausibles, catégorie et carburant reconnus. */
export function checkedRegistration(reading: RegistrationReading, today: string) {
  const first = isoDate(reading.first_registration);
  return {
    plate: validPlate(reading.plate),
    first_registration: first && first >= '1950-01-01' && first <= today ? first : null,
    brand: reading.brand.trim() || null,
    model: reading.model.trim() || null,
    vin: validVin(reading.vin),
    category: fleetCategory(reading.genre),
    fuel_type: fuelType(reading.energy),
    confidence: reading.confidence,
  };
}
