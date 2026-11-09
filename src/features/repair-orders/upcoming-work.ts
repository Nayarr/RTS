import { monthEnd } from '@/lib/month';
import type { SendLinkMessage } from '@/lib/send-links';

/**
 * « Profitez de l'immobilisation » : ce qui arrive bientôt à échéance sur le véhicule à l'atelier,
 * à proposer au client pendant que le camion est là (contrôle technique, hayon, antipollution,
 * extincteurs, vidange au kilométrage ou à l'année).
 */

/** Échéance proposée quand elle tombe dans les deux mois (ou est déjà dépassée). */
export const UPCOMING_DAYS = 60;
/** Vidange tous les 40 000 km pour un poids lourd, 15 000 km pour un utilitaire (pas de remorque). */
export const OIL_INTERVAL_KM: Partial<Record<string, number>> = { pl: 40_000, vul: 15_000 };
/** Vidange aussi proposée quand la dernière a plus d'un an. */
const OIL_MONTHS = 12;
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

/** Vidange connue : faite à l'atelier (OR) ou déclarée par le client (fiche véhicule). */
export interface OilChange {
  date: string;
  mileage: number | null;
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
  /** Vidanges déclarées (faites hors atelier). */
  oilChanges: OilChange[];
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

  // Vidange : kilomètres depuis la dernière, ou plus d'un an, ou aucune connue
  if (!covers(input.currentLines, 'oil')) {
    const detail = oilChangeDue(
      { vehicleType: input.vehicleType, mileage: input.mileage, changes: oilChangesOf(input) },
      today,
    );
    if (detail) items.push({ kind: 'oil', label: UPCOMING_LABELS.oil, detail, days: null });
  }

  const rank = (item: UpcomingItem) => (item.days === null ? Number.MAX_SAFE_INTEGER : item.days);
  return items.sort((a, b) => rank(a) - rank(b));
}

/** Vidanges connues : passages à l'atelier avec une ligne de vidange, et vidanges déclarées. */
export function oilChangesOf(input: Pick<UpcomingInput, 'history' | 'oilChanges'>): OilChange[] {
  return [
    ...input.history
      .filter((visit) => covers(visit.lines, 'oil'))
      .map((visit) => ({ date: visit.date.slice(0, 10), mileage: visit.mileage })),
    ...input.oilChanges.map((change) => ({ date: change.date.slice(0, 10), mileage: change.mileage })),
  ];
}

/**
 * Vidange à proposer : `km` quand l'écart de kilométrage dépasse l'intervalle du type de véhicule,
 * `time` quand la dernière a plus d'un an, `unknown` quand aucune n'est connue. Rien pour une remorque.
 */
export function oilChangeStatus(
  { vehicleType, mileage, changes }: { vehicleType: string; mileage: number | null; changes: OilChange[] },
  today: string,
): { reason: 'km' | 'time' | 'unknown'; detail: string } | null {
  const interval = OIL_INTERVAL_KM[vehicleType];
  if (!interval) return null;
  const sorted = [...changes].sort((a, b) => b.date.localeCompare(a.date));
  const last = sorted[0];
  if (!last) return { reason: 'unknown', detail: 'aucune vidange enregistrée pour ce véhicule' };
  const withKm = sorted.find((change) => change.mileage !== null);
  if (mileage !== null && withKm && withKm.mileage !== null && mileage >= withKm.mileage) {
    const driven = mileage - withKm.mileage;
    if (driven >= interval) {
      return {
        reason: 'km',
        detail:
          `${km(driven)} depuis la dernière vidange (à ${km(withKm.mileage)} le ${frenchDate(withKm.date)}), ` +
          `conseillée tous les ${km(interval)}`,
      };
    }
  }
  if (addMonths(last.date, OIL_MONTHS) <= today) {
    return { reason: 'time', detail: `dernière vidange le ${frenchDate(last.date)}, il y a plus d’un an` };
  }
  return null;
}

/** Texte de la vidange à proposer, ou null. */
export function oilChangeDue(
  input: { vehicleType: string; mileage: number | null; changes: OilChange[] },
  today: string,
): string | null {
  return oilChangeStatus(input, today)?.detail ?? null;
}

/** Vidange dite par le client à la création de l'OR (date, kilométrage facultatif). */
export interface DeclaredOil {
  date: string;
  mileage: string;
}

export const NO_DECLARED_OIL: DeclaredOil = { date: '', mileage: '' };

/** Kilométrage saisi (« 412 000 ») → nombre, ou null. */
export const mileageValue = (text: string): number | null => {
  const digits = text.replace(/\D/g, '');
  return digits ? Number(digits) : null;
};

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
