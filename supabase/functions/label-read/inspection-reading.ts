// Lecture d'un contrôle technique (procès-verbal ou vignette) : consigne envoyée à l'assistant,
// schéma de sa réponse et contrôle du VIN lu. Les dates sont contrôlées comme pour le hayon.

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
        'Numéro d’identification du véhicule (VIN, 17 caractères), ou chaîne vide si illisible ou absent.',
    },
    label_text: {
      type: 'string',
      description: 'Texte utile lu sur le document (résultat, dates, immatriculation), en une ligne courte.',
    },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
  },
  required: ['last_control_date', 'next_due_date', 'vin', 'label_text', 'confidence'],
  additionalProperties: false,
} as const;

/** Consigne pour l'assistant (la date du jour l'aide à lire les années abrégées). */
export function inspectionReadingPrompt(today: string): string {
  return [
    'Cette photo, prise par un mécanicien, montre le contrôle technique d’un camion, d’un utilitaire ou d’une remorque :',
    'procès-verbal de contrôle technique, ou vignette collée sur le pare-brise.',
    'Lis la date du contrôle, la date limite du prochain contrôle (souvent « à présenter avant le … »)',
    'et le numéro d’identification du véhicule (VIN, rubrique E du certificat, 17 caractères).',
    `Nous sommes le ${today}.`,
    'Donne les dates au format AAAA-MM-JJ et le VIN sans espace ; laisse une chaîne vide pour ce qui est illisible ou absent, sans l’inventer.',
    'confidence : « haute » si tout est net, « moyenne » si une partie est déduite, « faible » si la photo est floue ou ambiguë.',
  ].join('\n');
}

/** VIN lu : 17 caractères sans I, O ni Q (ISO 3779), espaces et tirets retirés ; sinon null. */
export function validVin(value: string): string | null {
  const vin = value.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}
