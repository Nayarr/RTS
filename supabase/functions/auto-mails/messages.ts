// Textes des e-mails automatiques : rappel de rendez-vous, confirmation, échéances.

export type AutoMailKind =
  | 'appointment_reminder'
  | 'appointment_confirmed'
  | 'ct'
  | 'tailgate'
  | 'antipollution'
  | 'maintenance'
  | 'rental_end';

/** E-mail préparé par la base (prepare_auto_mails). */
export interface AutoMailItem {
  key: string;
  kind: AutoMailKind;
  to: string;
  client_id?: string | null;
  vehicle_id?: string | null;
  appointment_id?: string | null;
  rental_id?: string | null;
  client_name?: string | null;
  plate?: string | null;
  reason?: string | null;
  /** Rendez-vous : jour et heure. */
  date?: string | null;
  time?: string | null;
  /** Échéance : date limite et jeton du lien de prise de rendez-vous. */
  due_date?: string | null;
  token?: string | null;
  /** Fin de location : numéro du contrat, reconduction tacite et son unité (« un jour »). */
  number?: string | null;
  tacit_renewal?: boolean | null;
  unit?: string | null;
}

export interface AutoMailContext {
  companyName: string;
  phone: string | null;
  /** Adresse de l'appli (lien de prise de rendez-vous) ; null : e-mails d'échéance non envoyés. */
  appUrl: string | null;
}

export interface AutoMail {
  subject: string;
  text: string;
  link?: { label: string; url: string };
}

const DEADLINES: AutoMailKind[] = ['ct', 'tailgate', 'antipollution', 'maintenance'];
export const isDeadline = (kind: AutoMailKind) => DEADLINES.includes(kind);

/** « 2026-10-14 » → « mercredi 14 octobre ». */
export function frenchDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** « 2026-10-14 » → « 14/10/2026 ». */
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** « 09:30 » → « 9h30 ». */
const hour = (time: string) => `${Number(time.slice(0, 2))}h${time.slice(3, 5)}`;

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Motif sans la mention « (demandé en ligne) » ajoutée au rendez-vous. */
const cleanReason = (reason: string | null | undefined) =>
  (reason ?? '').replace(/\s*\(demandé en ligne\)\s*$/, '').trim();

function signature(context: AutoMailContext) {
  return `Cordialement,\n${context.companyName}`;
}

/** E-mail à envoyer, ou null s'il manque de quoi l'écrire (lien de l'appli, date). */
export function buildAutoMail(item: AutoMailItem, context: AutoMailContext): AutoMail | null {
  const greeting = item.client_name ? `Bonjour ${item.client_name},` : 'Bonjour,';
  const vehicle = item.plate ? ` pour votre véhicule ${item.plate}` : '';
  const reason = cleanReason(item.reason);

  if (item.kind === 'rental_end') {
    if (!item.date || !item.time) return null;
    const contract = item.number ? `Votre location ${item.number}` : 'Votre location';
    const what = item.plate ? ` (véhicule ${item.plate})` : '';
    const next = item.tacit_renewal
      ? `Sans restitution à cette date, le contrat est reconduit tacitement d’${
        item.unit ?? 'un jour'
      }, et ainsi de suite jusqu’au retour du véhicule.`
      : 'Merci de restituer le véhicule à cette date.';
    return {
      subject: `Fin de votre location le ${frenchDay(item.date)} à ${hour(item.time)}`,
      text: [
        greeting,
        `${contract}${what} se termine le ${frenchDay(item.date)} à ${hour(item.time)}.`,
        next,
        context.phone ? `Pour toute question : ${context.phone}.` : '',
        signature(context),
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
  }

  if (item.kind === 'appointment_reminder' || item.kind === 'appointment_confirmed') {
    if (!item.date || !item.time) return null;
    const when = `${frenchDay(item.date)} à ${hour(item.time)}`;
    const what = reason ? ` (${lower(reason)})` : '';
    const call = context.phone
      ? `En cas d’empêchement, merci de nous prévenir au ${context.phone}.`
      : 'En cas d’empêchement, merci de nous prévenir en répondant à cet e-mail.';
    if (item.kind === 'appointment_reminder') {
      return {
        subject: `Rappel : votre rendez-vous demain à ${hour(item.time)}`,
        text: [
          greeting,
          `Nous vous rappelons votre rendez-vous demain, ${when}${vehicle}${what}.`,
          call,
          signature(context),
        ]
          .join('\n\n'),
      };
    }
    return {
      subject: `Rendez-vous confirmé : ${frenchDay(item.date)} à ${hour(item.time)}`,
      text: [
        greeting,
        `Votre rendez-vous est confirmé le ${when}${vehicle}${what}.`,
        'Vous recevrez un rappel la veille.',
        call,
        signature(context),
      ].join('\n\n'),
    };
  }

  if (!context.appUrl || !item.token) return null;
  const link = {
    label: 'Prendre rendez-vous',
    url: `${context.appUrl.replace(/\/+$/, '')}/rdv/${item.token}`,
  };
  const plate = item.plate ?? 'votre véhicule';
  if (item.kind === 'maintenance') {
    return {
      subject: `Entretien de ${plate} à prévoir`,
      text: [
        greeting,
        `L’entretien prévu dans votre contrat pour ${plate} est à refaire.`,
        'Choisissez le créneau qui vous convient en ligne : nous confirmons votre rendez-vous rapidement.',
        signature(context),
      ].join('\n\n'),
      link,
    };
  }
  const label = reason || 'Contrôle';
  const due = item.due_date ? ` le ${shortDate(item.due_date)}` : ' bientôt';
  return {
    subject: `${label} de ${plate} : échéance${due}`,
    text: [
      greeting,
      `Le ${lower(label)} de votre véhicule ${plate} arrive à échéance${due} : il doit être refait.`,
      'Choisissez le créneau qui vous convient en ligne : nous confirmons votre rendez-vous rapidement.',
      signature(context),
    ].join('\n\n'),
    link,
  };
}
