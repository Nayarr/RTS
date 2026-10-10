import type { SendLinkMessage } from '@/lib/send-links';

interface ShareCompany {
  legal_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  email: string | null;
}

/** Durée d'affichage d'une demande sur la borne (même valeur que la base). */
export const KIOSK_SIGNATURE_SECONDS = 60;

/** Secondes restantes, à partir de la valeur du serveur au moment de la lecture. */
export function secondsLeft(serverSeconds: number, readAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil(serverSeconds - (now - readAt) / 1000));
}

/** Largeur de la barre du temps restant (100 % au départ, 0 % à la fin de la minute). */
export const remainingPercent = (seconds: number) =>
  Math.min(100, Math.max(0, (seconds / KIOSK_SIGNATURE_SECONDS) * 100));

/** Borne considérée en ligne : signal reçu il y a moins de 90 s (elle en envoie un toutes les 30 s). */
export const KIOSK_ONLINE_SECONDS = 90;

/** État de la borne vu du bureau, d'après son dernier signal. */
export function kioskPresence(secondsAgo: number | null): { online: boolean; label: string } {
  if (secondsAgo === null) return { online: false, label: 'Borne jamais connectée' };
  if (secondsAgo <= KIOSK_ONLINE_SECONDS) return { online: true, label: 'Borne en ligne' };
  const minutes = Math.floor(secondsAgo / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const since = days >= 1 ? `${days} j` : hours >= 1 ? `${hours} h` : `${minutes} min`;
  return { online: false, label: `Borne hors ligne depuis ${since}` };
}

/** Message prêt à envoyer au client absent : lien pour signer l'OR en ligne. */
export function signatureShareMessage(
  order: { number: string; plate: string | null },
  link: string,
  company: ShareCompany,
): SendLinkMessage {
  const signature = [
    company.legal_name,
    `${company.address_line}, ${company.postal_code} ${company.city}`,
    company.email,
  ]
    .filter(Boolean)
    .join('\n');
  const vehicle = order.plate ? ` pour le véhicule ${order.plate}` : '';
  return {
    subject: `Ordre de réparation ${order.number} à signer · ${company.legal_name}`,
    body:
      `Bonjour,\n\nAvant d'intervenir${vehicle}, nous avons besoin de votre accord. ` +
      `Vous pouvez consulter l'ordre de réparation ${order.number} et le signer en ligne :\n\n${link}\n\n` +
      `Le lien est valable 7 jours.\n\nCordialement,\n${signature}`,
    sms: `Bonjour, merci de signer l'ordre de réparation ${order.number} ${company.legal_name}${vehicle} : ${link}`,
  };
}
