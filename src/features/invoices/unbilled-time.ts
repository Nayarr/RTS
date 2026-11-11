import type { InvoiceLine } from './api';

/** Écart à partir duquel on prévient : une demi-heure badgée de plus que facturée. */
export const UNBILLED_THRESHOLD_HOURS = 0.5;

type HoursLine = Pick<InvoiceLine, 'line_type' | 'quantity' | 'billed_hours' | 'standard_hours'>;

/**
 * Heures facturées sur la facture : quantité des lignes de main d'œuvre, et temps compris dans
 * les forfaits (temps retenu, sinon barème, multiplié par le nombre de forfaits).
 */
export function billedLaborHours(lines: HoursLine[]): number {
  let hours = 0;
  for (const line of lines) {
    if (line.line_type === 'labor') hours += line.quantity;
    else if (line.line_type === 'package') {
      hours += line.quantity * (line.billed_hours ?? line.standard_hours ?? 0);
    }
  }
  return hours;
}

/** Heures lisibles : 4 → « 4 h », 2,5 → « 2 h 30 », 0,75 → « 45 min ». */
export function hoursLabel(hours: number): string {
  const minutes = Math.round(hours * 60);
  const whole = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (whole === 0) return `${rest} min`;
  return rest === 0 ? `${whole} h` : `${whole} h ${String(rest).padStart(2, '0')}`;
}

/**
 * Temps passé mais non facturé : les techniciens ont badgé nettement plus que ce qui est facturé.
 * Renvoie le message à afficher, ou null si l'écart est sous le seuil.
 */
export function unbilledTimeWarning(badgedSeconds: number, lines: HoursLine[]): string | null {
  const badged = badgedSeconds / 3600;
  const billed = billedLaborHours(lines);
  if (badged - billed < UNBILLED_THRESHOLD_HOURS) return null;
  const billedText = billed > 0 ? agreed(hoursLabel(billed), 'facturée') : 'aucune heure facturée';
  return `${agreed(hoursLabel(badged), 'badgée')}, ${billedText} : vérifie s’il manque une ligne.`;
}

/** « 1 h badgée », mais « 2 h badgées », « 1 h 30 badgées », « 45 min badgées ». */
const agreed = (label: string, word: string) => `${label} ${word}${label === '1 h' ? '' : 's'}`;
