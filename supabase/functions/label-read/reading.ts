// Lecture d'une étiquette de contrôle hayon : consigne envoyée à l'assistant, schéma de sa réponse
// (mois et année au format MMAAAA), contrôle du mois lu et calcul de la prochaine échéance.
// validDate sert aussi au procès-verbal du contrôle technique.

/** Contrôle périodique d'un hayon élévateur : tous les 6 mois (même règle que l'ancienne appli). */
export const TAILGATE_INTERVAL_MONTHS = 6;

/**
 * Réponse attendue de l'assistant pour une étiquette de hayon (sortie JSON imposée) : seulement
 * le mois et l'année, au format MMAAAA (« 052025 »), le jour n'étant pas utilisé.
 */
export const TAILGATE_READING_SCHEMA = {
  type: 'object',
  properties: {
    due_month: {
      type: 'string',
      description:
        'Mois et année de la prochaine échéance (fin de validité) au format MMAAAA, ex. 052025, ou chaîne vide si illisible ou absente.',
    },
    last_control_month: {
      type: 'string',
      description:
        'Mois et année du dernier contrôle au format MMAAAA, ou chaîne vide si absent ou illisible.',
    },
    label_text: {
      type: 'string',
      description: 'Texte utile lu sur l’étiquette (organisme, cases percées), en une ligne courte.',
    },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'faible'] },
  },
  required: ['due_month', 'last_control_month', 'label_text', 'confidence'],
  additionalProperties: false,
} as const;

export interface TailgateReading {
  due_month: string;
  last_control_month: string;
  label_text: string;
  confidence: 'haute' | 'moyenne' | 'faible';
}

/** Consigne pour l'assistant (la date du jour l'aide à lire les années à deux chiffres). */
export function tailgateReadingPrompt(today: string): string {
  return [
    'Cette photo, prise par un mécanicien, montre l’étiquette de contrôle périodique (VGP) d’un hayon élévateur de camion.',
    `Nous sommes le ${today}.`,
    'Ces étiquettes sont souvent des disques poinçonnés : une couronne de mois (1 à 12 ou 01 à 12), une couronne',
    'd’années (2018, 2019… ou 23, 24, 25… pour 2023, 2024, 2025) et parfois une couronne de jours.',
    'La case retenue est PERCÉE (trou rond : on voit le métal, ou un point noir ou sombre au travers), découpée,',
    'cochée, barrée ou entourée. Un seul trou par couronne : c’est la valeur retenue.',
    'Lis seulement le mois et l’année : ignore le jour, il n’est pas utilisé.',
    'due_month : la prochaine échéance, c’est-à-dire la date indiquée sous « Prochain contrôle le », « Date de fin',
    'de validation », « Valable jusqu’au » ou équivalent. last_control_month : la date du contrôle effectué, si',
    'l’étiquette la donne à part ; sinon chaîne vide.',
    'Réponds au format MMAAAA sur six chiffres (mai 2025 : 052025). Une année à deux chiffres se lit 20AA.',
    'Si le trou du mois ou de l’année ne se voit pas avec certitude, laisse une chaîne vide : n’invente rien.',
    'confidence : « haute » si les cases percées sont nettes, « moyenne » si une partie est déduite, « faible » si la photo est floue ou ambiguë.',
  ].join('\n');
}

const MONTH_YEAR = /^(\d{2})(\d{4})$/;

/** Mois MMAAAA réel et plausible (de 2000 à dans 10 ans), sinon null. */
export function validMonth(value: string, today: string): string | null {
  const match = MONTH_YEAR.exec(value.trim());
  if (!match) return null;
  const [month, year] = [Number(match[1]), Number(match[2])];
  const limit = Number(today.slice(0, 4)) + 10;
  return month >= 1 && month <= 12 && year >= 2000 && year <= limit ? value.trim() : null;
}

/** Ajoute des mois à un mois MMAAAA (122025 + 6 = 062026). */
export function addMonthsToMonth(value: string, months: number): string {
  const month = Number(value.slice(0, 2)) - 1 + months;
  const year = Number(value.slice(2)) + Math.floor(month / 12);
  return `${String((month % 12) + 1).padStart(2, '0')}${year}`;
}

/** Prochaine échéance : celle lue sur l'étiquette, sinon dernier contrôle + 6 mois, sinon null. */
export function nextDueMonth(reading: TailgateReading, today: string): string | null {
  const due = validMonth(reading.due_month, today);
  if (due) return due;
  const last = validMonth(reading.last_control_month, today);
  return last ? addMonthsToMonth(last, TAILGATE_INTERVAL_MONTHS) : null;
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
