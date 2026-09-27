/**
 * Dates des tests e2e à l'heure de Paris, comme le navigateur des tests (timezoneId)
 * et l'atelier : la CI tourne en UTC, « demain » n'y est pas le même jour autour de minuit.
 */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' });

/** Jour « AAAA-MM-JJ » à Paris, décalé de `offset` jours. */
export function parisDay(offset = 0): string {
  const date = new Date(`${PARIS_DAY.format(new Date())}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export const isSunday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay() === 0;

/** Jour `dayOfMonth` du mois précédent (à Paris). */
export function parisDayOfPreviousMonth(dayOfMonth: number): string {
  const [year = 0, month = 1] = parisDay().split('-').map(Number);
  return new Date(Date.UTC(year, month - 2, dayOfMonth, 12)).toISOString().slice(0, 10);
}
