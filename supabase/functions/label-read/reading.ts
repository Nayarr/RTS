// Lecture d'une étiquette de contrôle hayon : consigne envoyée à l'assistant, schéma de sa réponse,
// contrôle des dates lues et calcul de la prochaine échéance.

/** Contrôle périodique d'un hayon élévateur : tous les 6 mois (même règle que l'ancienne appli). */
export const TAILGATE_INTERVAL_MONTHS = 6;

/** Réponse attendue de l'assistant (sortie JSON imposée par ce schéma). */
export const READING_SCHEMA = {
  type: 'object',
  properties: {
    last_control_date: {
      type: 'string',
      description: 'Date du dernier contrôle au format AAAA-MM-JJ, ou chaîne vide si illisible ou absente.',
    },
    next_due_date: {
      type: 'string',
      description: 'Date du prochain contrôle au format AAAA-MM-JJ, ou chaîne vide si illisible ou absente.',
    },
    label_text: {
      type: 'string',
      description: 'Texte utile lu sur l’étiquette, en une ligne courte.',
    },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
  },
  required: ['last_control_date', 'next_due_date', 'label_text', 'confidence'],
  additionalProperties: false,
} as const;

export interface LabelReading {
  last_control_date: string;
  next_due_date: string;
  label_text: string;
  confidence: 'haute' | 'moyenne' | 'faible';
}

/** Consigne pour l'assistant (la date du jour l'aide à lire les années abrégées). */
export function readingPrompt(today: string): string {
  return [
    'Cette photo, prise par un mécanicien, montre l’étiquette de contrôle périodique d’un hayon élévateur de camion.',
    'Lis la date du dernier contrôle (vérification) et la date du prochain contrôle (échéance), si elles y figurent.',
    `Nous sommes le ${today}.`,
    'Les étiquettes indiquent souvent seulement un mois et une année (parfois perforés, cochés ou entourés) :',
    'prends alors le 1er jour du mois pour le dernier contrôle et le dernier jour du mois pour le prochain.',
    'Donne les dates au format AAAA-MM-JJ ; laisse une chaîne vide pour une date illisible ou absente, sans l’inventer.',
    'confidence : « haute » si les dates sont nettes, « moyenne » si une partie est déduite, « faible » si la photo est floue ou ambiguë.',
  ].join('\n');
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date AAAA-MM-JJ réelle et plausible (de 2000 à dans 10 ans), sinon null. */
export function validDate(value: string, today: string): string | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  const limit = Number(today.slice(0, 4)) + 10;
  return year >= 2000 && year <= limit ? value.trim() : null;
}

/** Ajoute des mois en restant sur un jour valide (31 août + 6 mois = 28 ou 29 février). */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Prochaine échéance : celle lue sur l'étiquette, sinon dernier contrôle + 6 mois, sinon null. */
export function nextDueDate(reading: LabelReading, today: string): string | null {
  const next = validDate(reading.next_due_date, today);
  if (next) return next;
  const last = validDate(reading.last_control_date, today);
  return last ? addMonths(last, TAILGATE_INTERVAL_MONTHS) : null;
}
