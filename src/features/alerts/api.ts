import { supabase } from '@/lib/supabase';
import type { Tables } from '@/types/database';

type NotificationRow = Tables<'v_my_notifications'>;
type Guaranteed = 'id' | 'type' | 'title' | 'created_at';

/** Alerte visible par l'utilisateur connecté, avec sa date de lecture (null : non lue). */
export type AppNotification = Omit<NotificationRow, Guaranteed> & {
  [K in Guaranteed]: NonNullable<NotificationRow[K]>;
};

const LIMIT = 60;

export async function fetchMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('v_my_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  return data as AppNotification[];
}

/** Marque des alertes comme lues pour l'utilisateur connecté (déjà lues : ignorées). */
export async function markNotificationsRead(ids: string[], profileId: string) {
  if (ids.length === 0) return;
  const { error } = await supabase.from('notification_reads').upsert(
    ids.map((id) => ({ notification_id: id, profile_id: profileId })),
    { onConflict: 'notification_id,profile_id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** Nouvelles alertes en direct (Supabase Realtime, droits de l'utilisateur appliqués). */
export function subscribeToNotifications(onInsert: () => void): () => void {
  const channel = supabase
    .channel('notifications')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, onInsert)
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
