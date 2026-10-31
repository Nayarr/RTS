import { z } from 'zod';
import { addDays } from '@/features/planning/domain';
import { clock, dayStart, isoDay, type PersonalEvent } from './domain';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indique la date');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide');

/** Rendez-vous de l'agenda : sur un jour avec ses heures, ou en journées entières. */
export const eventSchema = z
  .object({
    title: z.string().trim().min(1, 'Indique l’objet du rendez-vous').max(200),
    date: day,
    all_day: z.boolean(),
    start: time,
    end: time,
    end_date: day,
    location: z.string().trim().max(200),
    notes: z.string().trim().max(4000),
  })
  .superRefine((values, ctx) => {
    if (values.all_day && values.end_date < values.date) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Le dernier jour doit suivre le premier' });
    }
    if (values.all_day && values.end_date > addDays(values.date, 61)) {
      ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'Deux mois au plus' });
    }
    if (!values.all_day && values.end <= values.start) {
      ctx.addIssue({ code: 'custom', path: ['end'], message: 'L’heure de fin doit être après le début' });
    }
  });
export type EventValues = z.infer<typeof eventSchema>;

export type EventInput = Pick<
  PersonalEvent,
  'title' | 'starts_at' | 'ends_at' | 'all_day' | 'location' | 'notes'
>;

/** Nouveau rendez-vous : jour et heures proposés (case cliquée, prochain créneau). */
export interface EventPreset {
  date: string;
  start: string;
  end: string;
}

export function eventToForm(event: PersonalEvent | null, preset: EventPreset): EventValues {
  if (!event) {
    return {
      title: '',
      date: preset.date,
      all_day: false,
      start: preset.start,
      end: preset.end,
      end_date: preset.date,
      location: '',
      notes: '',
    };
  }
  const starts = new Date(event.starts_at);
  const ends = new Date(event.ends_at);
  return {
    title: event.title,
    date: isoDay(starts),
    all_day: event.all_day,
    start: event.all_day ? preset.start : clock(starts),
    end: event.all_day ? preset.end : clock(ends),
    // Journée entière : la fin est le lendemain minuit du dernier jour
    end_date: event.all_day ? addDays(isoDay(ends), -1) : isoDay(starts),
    location: event.location ?? '',
    notes: event.notes ?? '',
  };
}

export function eventFromForm(values: EventValues): EventInput {
  const at = (iso: string, time: string) => new Date(`${iso}T${time}:00`).toISOString();
  return {
    title: values.title.trim(),
    all_day: values.all_day,
    starts_at: values.all_day ? dayStart(values.date).toISOString() : at(values.date, values.start),
    ends_at: values.all_day
      ? dayStart(addDays(values.end_date, 1)).toISOString()
      : at(values.date, values.end),
    location: values.location.trim() || null,
    notes: values.notes.trim() || null,
  };
}
