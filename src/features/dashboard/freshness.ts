const time = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
});
const day = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' });

/**
 * Fraîcheur des chiffres de l'accueil : « À jour à 14:32 », ou sans réseau
 * « Hors connexion : chiffres du 17/10 à 14:32 » (dernier chargement gardé sur l'appareil).
 */
export function freshnessLabel(updatedAt: number, online: boolean) {
  const date = new Date(updatedAt);
  return online
    ? `À jour à ${time.format(date)}`
    : `Hors connexion : chiffres du ${day.format(date)} à ${time.format(date)}`;
}
