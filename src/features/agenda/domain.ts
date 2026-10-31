// Agenda personnel : jours affichés, place des rendez-vous dans la grille, libellés.
import { addDays, mondayOf, weekdayIndex } from '@/features/planning/domain';
import type { Tables } from '@/types/database';

export type PersonalEvent = Tables<'personal_events'>;
export type AgendaView = 'jour' | 'semaine' | 'mois';

/** Heures de la grille (jour, semaine) : 6 h - 22 h, les rendez-vous en dehors sont ramenés au bord. */
export const GRID_START = 6 * 60;
export const GRID_END = 22 * 60;

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const SHORT_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];
export const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// ---------------------------------------------------------------- Jours (« AAAA-MM-JJ », heure locale)

export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Minuit (heure locale) du jour. */
export const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);

const dayNumber = (iso: string) => Number(iso.slice(8, 10));
const monthName = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';

/** 1er du mois du jour donné. */
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Même jour (ou dernier jour) du mois décalé de `months`. */
export function addMonths(iso: string, months: number): string {
  const [year, month] = iso.split('-').map(Number) as [number, number];
  const target = new Date(year, month - 1 + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return isoDay(new Date(target.getFullYear(), target.getMonth(), Math.min(dayNumber(iso), last)));
}

/** Grille d'un mois : six semaines du lundi au dimanche, le mois au milieu. */
export function monthGrid(iso: string): string[] {
  const first = mondayOf(monthStart(iso));
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

/** Jours affichés par la vue. */
export function viewDays(view: AgendaView, iso: string): string[] {
  if (view === 'jour') return [iso];
  if (view === 'semaine') return Array.from({ length: 7 }, (_, index) => addDays(mondayOf(iso), index));
  return monthGrid(iso);
}

/** Pas des flèches précédent / suivant. */
export function shiftDate(view: AgendaView, iso: string, direction: 1 | -1): string {
  if (view === 'mois') return addMonths(iso, direction);
  return addDays(iso, direction * (view === 'semaine' ? 7 : 1));
}

/** « vendredi 30 octobre 2026 », « 26 oct. - 1 nov. 2026 », « octobre 2026 ». */
export function periodLabel(view: AgendaView, iso: string): string {
  const year = iso.slice(0, 4);
  if (view === 'mois') return `${monthName(iso)} ${year}`;
  if (view === 'jour') return `${WEEKDAYS[weekdayIndex(iso)]} ${dayNumber(iso)} ${monthName(iso)} ${year}`;
  const days = viewDays('semaine', iso);
  const first = days[0]!;
  const last = days[6]!;
  const short = (day: string) => `${dayNumber(day)} ${SHORT_MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;
  return first.slice(5, 7) === last.slice(5, 7)
    ? `${dayNumber(first)} - ${dayNumber(last)} ${monthName(last)} ${last.slice(0, 4)}`
    : `${short(first)} - ${short(last)} ${last.slice(0, 4)}`;
}

/** « lundi 2 novembre » */
export const longDay = (iso: string) => `${WEEKDAYS[weekdayIndex(iso)]} ${dayNumber(iso)} ${monthName(iso)}`;

/** Bornes de la période chargée : du premier jour affiché au lendemain du dernier. */
export function viewRange(view: AgendaView, iso: string): { from: string; to: string } {
  const days = viewDays(view, iso);
  return { from: days[0]!, to: addDays(days[days.length - 1]!, 1) };
}

// ---------------------------------------------------------------- Heures

/** « 09:30 » */
export const clock = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/** Minutes depuis minuit du jour `iso` (négatif avant, au-delà de 1440 après). */
const minutesInto = (iso: string, date: Date) => (date.getTime() - dayStart(iso).getTime()) / 60_000;

/** Horaire affiché : « 09:30 - 10:30 », « Journée entière ». */
export function timeLabel(event: Pick<PersonalEvent, 'starts_at' | 'ends_at' | 'all_day'>): string {
  if (event.all_day) return 'Journée entière';
  return `${clock(new Date(event.starts_at))} - ${clock(new Date(event.ends_at))}`;
}

/** Le rendez-vous occupe-t-il une partie du jour ? */
export function onDay(event: Pick<PersonalEvent, 'starts_at' | 'ends_at'>, iso: string): boolean {
  const start = dayStart(iso).getTime();
  const end = dayStart(addDays(iso, 1)).getTime();
  return new Date(event.starts_at).getTime() < end && new Date(event.ends_at).getTime() > start;
}

/** Rendez-vous du jour triés : journées entières d'abord, puis par heure de début. */
export function eventsOfDay<T extends Pick<PersonalEvent, 'starts_at' | 'ends_at' | 'all_day'>>(
  events: T[],
  iso: string,
): T[] {
  return events
    .filter((event) => onDay(event, iso))
    .sort(
      (a, b) =>
        Number(b.all_day) - Number(a.all_day) ||
        a.starts_at.localeCompare(b.starts_at) ||
        a.ends_at.localeCompare(b.ends_at),
    );
}

/**
 * Place du rendez-vous dans la colonne du jour (minutes depuis minuit, bornées à la grille) ;
 * un rendez-vous sur plusieurs jours occupe chaque jour jusqu'au bord.
 */
export function daySpan(event: Pick<PersonalEvent, 'starts_at' | 'ends_at'>, iso: string) {
  const start = Math.max(minutesInto(iso, new Date(event.starts_at)), 0);
  const end = Math.min(minutesInto(iso, new Date(event.ends_at)), 24 * 60);
  const top = Math.min(Math.max(start, GRID_START), GRID_END - 15);
  return { start: top, end: Math.max(Math.min(Math.max(end, GRID_START), GRID_END), top + 15) };
}

/** Horaire cliqué dans la grille, à la demi-heure : rendez-vous d'une heure proposé. */
export function slotAt(minutes: number): { start: string; end: string } {
  const start = Math.min(Math.max(Math.floor(minutes / 30) * 30, GRID_START), GRID_END - 60);
  const time = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  return { start: time(start), end: time(start + 60) };
}

/** Prochain créneau à la demi-heure (nouveau rendez-vous aujourd'hui). */
export function nextSlot(now: Date): { start: string; end: string } {
  return slotAt(now.getHours() * 60 + now.getMinutes() + 30);
}
