import { supabase } from '@/lib/supabase';
import { dayStart, type PersonalEvent } from './domain';
import type { EventInput } from './schemas';

/** Rendez-vous du compte connecté qui touchent la période (jours locaux, fin exclue). */
export async function fetchEvents(from: string, to: string): Promise<PersonalEvent[]> {
  const { data, error } = await supabase
    .from('personal_events')
    .select('*')
    .lt('starts_at', dayStart(to).toISOString())
    .gt('ends_at', dayStart(from).toISOString())
    .order('starts_at')
    .limit(1000);
  if (error) throw error;
  return data;
}

/** Crée le rendez-vous (`id` absent) ou le modifie. */
export async function saveEvent({ id, ...input }: EventInput & { id?: string }): Promise<void> {
  const { error } = id
    ? await supabase.from('personal_events').update(input).eq('id', id)
    : await supabase.from('personal_events').insert(input);
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('personal_events').delete().eq('id', id);
  if (error) throw error;
}
