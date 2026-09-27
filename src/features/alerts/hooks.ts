import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMyNotifications, markNotificationsRead, subscribeToNotifications } from './api';

export const notificationsKey = ['notifications'] as const;

/** Alertes de l'utilisateur : chargées, puis tenues à jour en direct (et toutes les minutes). */
export function useNotifications(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return subscribeToNotifications(() => void queryClient.invalidateQueries({ queryKey: notificationsKey }));
  }, [enabled, queryClient]);
  return useQuery({
    queryKey: notificationsKey,
    queryFn: fetchMyNotifications,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationsRead(profileId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => (profileId ? markNotificationsRead(ids, profileId) : Promise.resolve()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationsKey }),
  });
}
