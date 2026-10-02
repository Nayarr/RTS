const roundedEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Montant arrondi à l'euro (comme l'ancienne appli sur les écrans de pilotage). */
export const formatEuroRounded = (value: number) => roundedEuro.format(value);

/** « 2026-09-01 » → « sept. 26 » */
export const monthLabel = (month: string) =>
  new Date(`${month}T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

/** « 2026-09-28 » → « 28/09 » */
/** « Septembre 2026 » (titre du détail d'un mois). */
export const monthLongLabel = (month: string) => {
  const text = new Date(`${month}T00:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const shortDayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/** Montant au-dessus d'une barre : « 12,5k », rien si nul. */
export const compactAmount = (value: number) =>
  value > 0 ? `${(Math.round(value / 100) / 10).toLocaleString('fr-FR')}k` : '';

/** Hauteur d'une barre en % de la plus haute (la plus haute = 100 %). */
export const barPercent = (value: number, max: number) => (max > 0 ? (Math.max(value, 0) / max) * 100 : 0);

/** Retard moyen : vert si à l'heure, orange jusqu'à 5 jours, rouge au-delà. */
export function delayTone(days: number): 'good' | 'warning' | 'bad' {
  if (days > 5) return 'bad';
  if (days > 0) return 'warning';
  return 'good';
}

export const formatDelay = (days: number) => `${days > 0 ? '+' : ''}${days} j`;
