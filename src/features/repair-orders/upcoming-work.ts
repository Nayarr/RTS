import { monthEnd } from '@/lib/month';
import type { SendLinkMessage } from '@/lib/send-links';

/**
 * « Profitez de l'immobilisation » : ce qui arrive bientôt à échéance sur le véhicule à l'atelier,
 * à proposer au client pendant que le camion est là (contrôle technique, hayon, antipollution,
 * extincteurs, vidange au kilométrage).
 */

/** Échéance proposée quand elle tombe dans les deux mois (ou est déjà dépassée). */
export const UPCOMING_DAYS = 60;
/** Vidange proposée à moins de 5 000 km de l'intervalle. */
export const OIL_MARGIN_KM = 5_000;
/** Intervalle de vidange retenu par type de véhicule (une remorque n'en a pas). */
export const OIL_INTERVAL_KM: Partial<Record<string, number>> = { pl: 60_000, vul: 30_000 };
/** Contrôle des extincteurs : une fois par an. */
const EXTINGUISHER_MONTHS = 12;

export type UpcomingKind = 'ct' | 'tailgate' | 'antipollution' | 'extinguisher' | 'oil';

export interface UpcomingItem {
  kind: UpcomingKind;
  label: string;
  /** Détail lu par le bureau et repris dans le mail (« avant le 12/12/2026 »). */
  detail: string;
  /** Jours avant l'échéance (négatif : dépassée) ; absent pour la vidange ou une date inconnue. */
  days: number | null;
}

/** Passage précédent du véhicule : date, kilométrage et travaux (désignations). */
export interface PastVisit {
  date: string;
  mileage: number | null;
  lines: string[];
}

export interface UpcomingInput {
  vehicleType: string;
  ctDueDate: string | null;
  /** Mois du contrôle hayon (AAAA-MM-01) : échéance à la fin du mois. */
  tailgateDueMonth: string | null;
  antipollutionDueDate: string | null;
  /** Kilométrage relevé à l'entrée de cet OR. */
  mileage: number | null;
  /** Travaux déjà prévus sur cet OR : une prestation déjà là n'est pas reproposée. */
  currentLines: string[];
  history: PastVisit[];
}

export const UPCOMING_LABELS: Record<UpcomingKind, string> = {
  ct: 'Contrôle technique',
  tailgate: 'Contrôle hayon',
  antipollution: 'Contrôle antipollution',
  extinguisher: 'Contrôle des extincteurs',
  oil: 'Vidange',
};

/** Travaux qui couvrent déjà l'échéance (désignation des lignes, sans accent ni casse). */
const COVERED: Record<UpcomingKind, RegExp> = {
  ct: /controle technique|\bct\b/,
  tailgate: /hayon/,
  antipollution: /antipollution|anti pollution|opacite/,
  extinguisher: /extincteur/,
  oil: /vidange/,
};

const loose = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[-']/g, ' ');

const covers = (lines: string[], kind: UpcomingKind) => lines.some((line) => COVERED[kind].test(loose(line)));

const dayNumber = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
const frenchDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const frenchMonth = (iso: string) =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
const km = (value: number) => `${value.toLocaleString('fr-FR').replace(/\s/g, ' ')} km`;

function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** « avant le 12/12/2026 », ou « dépassé depuis le 02/11/2026 ». */
const dueText = (due: string, days: number) =>
  days < 0 ? `dépassé depuis le ${frenchDate(due)}` : `à faire avant le ${frenchDate(due)}`;

/** Échéances à proposer, de la plus urgente à la moins urgente (vidange en dernier). */
export function upcomingWork(input: UpcomingInput, today: string): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  const dated = (kind: UpcomingKind, due: string | null, detail?: (days: number) => string) => {
    if (!due || covers(input.currentLines, kind)) return;
    const days = daysBetween(today, due);
    if (days > UPCOMING_DAYS) return;
    items.push({ kind, label: UPCOMING_LABELS[kind], detail: detail?.(days) ?? dueText(due, days), days });
  };

  dated('ct', input.ctDueDate);
  dated('tailgate', input.tailgateDueMonth && monthEnd(input.tailgateDueMonth), (days) =>
    days < 0
      ? `dépassé (échéance ${frenchMonth(input.tailgateDueMonth!)})`
      : `échéance ${frenchMonth(input.tailgateDueMonth!)}`,
  );
  dated('antipollution', input.antipollutionDueDate);

  // Extincteurs (pas sur une remorque) : un an après le dernier contrôle fait à l'atelier
  if (input.vehicleType !== 'remorque' && !covers(input.currentLines, 'extinguisher')) {
    const last = input.history
      .filter((visit) => covers(visit.lines, 'extinguisher'))
      .map((visit) => visit.date.slice(0, 10))
      .sort()
      .at(-1);
    if (!last) {
      items.push({
        kind: 'extinguisher',
        label: UPCOMING_LABELS.extinguisher,
        detail: 'aucun contrôle enregistré à l’atelier',
        days: null,
      });
    } else {
      const due = addMonths(last, EXTINGUISHER_MONTHS);
      dated(
        'extinguisher',
        due,
        (days) =>
          `dernier contrôle le ${frenchDate(last)}, ${days < 0 ? 'à refaire depuis le' : 'à refaire avant le'} ${frenchDate(due)}`,
      );
    }
  }

  // Vidange : kilomètres parcourus depuis la dernière vidange faite à l'atelier
  const interval = OIL_INTERVAL_KM[input.vehicleType];
  if (interval && input.mileage !== null && !covers(input.currentLines, 'oil')) {
    const last = input.history
      .filter((visit) => visit.mileage !== null && covers(visit.lines, 'oil'))
      .sort((a, b) => (b.mileage ?? 0) - (a.mileage ?? 0))[0];
    if (last && last.mileage !== null && input.mileage >= last.mileage) {
      const driven = input.mileage - last.mileage;
      if (driven >= interval - OIL_MARGIN_KM) {
        items.push({
          kind: 'oil',
          label: UPCOMING_LABELS.oil,
          detail: `${km(driven)} depuis la dernière (faite à ${km(last.mileage)}, conseillée tous les ${km(interval)})`,
          days: null,
        });
      }
    }
  }

  const rank = (item: UpcomingItem) => (item.days === null ? Number.MAX_SAFE_INTEGER : item.days);
  return items.sort((a, b) => rank(a) - rank(b));
}

interface MessageCompany {
  legal_name: string;
  email: string | null;
  phone?: string | null;
}

/**
 * Mail au client (modèle, pas de texte généré) : son nom, le véhicule et les prestations à proposer.
 * Le bureau le relit et le modifie avant l'envoi.
 */
export function upcomingWorkMessage(
  { clientName, plate, items }: { clientName: string | null; plate: string; items: UpcomingItem[] },
  company: MessageCompany,
): SendLinkMessage {
  const list = items.map((item) => `- ${item.label} : ${item.detail}`).join('\n');
  const signature = [company.legal_name, company.email, company.phone].filter(Boolean).join('\n');
  const who = clientName?.trim() ? `de ${clientName.trim()} ` : '';
  const body =
    `Bonjour,\n\n` +
    `Votre véhicule ${plate} ${who}est actuellement dans notre atelier. ` +
    `Nous en profitons pour vous signaler les échéances qui arrivent :\n\n${list}\n\n` +
    'Nous pouvons nous en occuper pendant cette immobilisation, sans nouveau rendez-vous ni ' +
    'nouvel arrêt du véhicule. Répondez simplement à ce mail ou appelez-nous pour nous donner votre accord.\n\n' +
    `Cordialement,\n${signature}`;
  return {
    subject: `Profitez de l’immobilisation de votre véhicule ${plate} · ${company.legal_name}`,
    body,
    sms:
      `${company.legal_name} : votre véhicule ${plate} est à l’atelier. Échéances à prévoir : ` +
      `${items.map((item) => item.label.toLowerCase()).join(', ')}. ` +
      'Nous pouvons nous en occuper pendant l’immobilisation : répondez pour donner votre accord.',
  };
}
