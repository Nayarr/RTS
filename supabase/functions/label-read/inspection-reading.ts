// Lecture d'un contrôle technique (procès-verbal ou vignette) : consigne envoyée à l'assistant,
// schéma de sa réponse et contrôle du VIN et de la plaque lus. Vignette du pare-brise : seulement
// l'immatriculation et le VIN. Les dates d'un procès-verbal sont contrôlées comme pour le hayon.

/** Réponse attendue de l'assistant (sortie JSON imposée par ce schéma). */
export const INSPECTION_READING_SCHEMA = {
  type: 'object',
  properties: {
    last_control_date: {
      type: 'string',
      description: 'Date du contrôle technique au format AAAA-MM-JJ, ou chaîne vide si illisible ou absente.',
    },
    next_due_date: {
      type: 'string',
      description:
        'Date limite du prochain contrôle (« à présenter avant le ») au format AAAA-MM-JJ, ou chaîne vide si illisible ou absente.',
    },
    vin: {
      type: 'string',
      description:
        'Numéro d’identification du véhicule (VIN, 17 caractères, aussi appelé « numéro de série »), ou chaîne vide si illisible ou absent.',
    },
    plate: {
      type: 'string',
      description: 'Immatriculation du véhicule (ex. AB-123-CD), ou chaîne vide si illisible ou absente.',
    },
    label_text: {
      type: 'string',
      description: 'Texte utile lu sur le document (résultat, dates, immatriculation), en une ligne courte.',
    },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
  },
  required: ['last_control_date', 'next_due_date', 'vin', 'plate', 'label_text', 'confidence'],
  additionalProperties: false,
} as const;

/** Consigne pour l'assistant (la date du jour l'aide à lire les années abrégées). */
export function inspectionReadingPrompt(today: string): string {
  return [
    'Cette photo, prise par un mécanicien, montre le contrôle technique d’un camion, d’un utilitaire ou d’une remorque :',
    'procès-verbal de contrôle technique, ou vignette collée sur le pare-brise.',
    'Le « numéro de série » (ou « N° de série ») et le numéro de châssis sont le VIN : numéro d’identification du véhicule, 17 caractères (rubrique E du certificat).',
    'Vignette collée sur le pare-brise : lis uniquement l’immatriculation et le VIN, et laisse les deux dates vides.',
    'Procès-verbal : lis aussi la date du contrôle et la date limite du prochain contrôle (souvent « à présenter avant le … »).',
    `Nous sommes le ${today}.`,
    'Donne les dates au format AAAA-MM-JJ et le VIN sans espace ; laisse une chaîne vide pour ce qui est illisible ou absent, sans l’inventer.',
    'confidence : « haute » si tout est net, « moyenne » si une partie est déduite, « faible » si la photo est floue ou ambiguë.',
  ].join('\n');
}

/** Immatriculation lue, en majuscules (« ab 123 cd » → « AB-123-CD » au format SIV) ; sinon null. */
export function validPlate(value: string): string | null {
  const plate = value.replace(/[\s-]/g, '').toUpperCase();
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(plate)) {
    return `${plate.slice(0, 2)}-${plate.slice(2, 5)}-${plate.slice(5)}`;
  }
  return /^[A-Z0-9]{4,10}$/.test(plate) ? plate : null;
}

/** VIN lu : 17 caractères sans I, O ni Q (ISO 3779), espaces et tirets retirés ; sinon null. */
export function validVin(value: string): string | null {
  const vin = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}
