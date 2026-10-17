import { useEffect, useSyncExternalStore } from 'react';
import { onlineManager, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchOfficeDashboard, subscribeToDashboardChanges } from './api';

export const officeDashboardKey = ['office-dashboard'] as const;
const workloadKey = ['workshop-workload'] as const;

/** Chiffres de l'accueil (et charge de l'atelier) à relire après une action ou un changement. */
export function invalidateDashboard(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: officeDashboardKey });
  void queryClient.invalidateQueries({ queryKey: workloadKey });
}

/** Chiffres de l'accueil, gardés hors ligne (chiffres du dernier chargement). */
export function useOfficeDashboard({
  enabled = true,
  live = false,
}: { enabled?: boolean; live?: boolean } = {}) {
  const queryClient = useQueryClient();
  // Accueil ouvert : tenu à jour en direct, regroupé sur une seconde (plusieurs changements d'un coup)
  useEffect(() => {
    if (!enabled || !live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToDashboardChanges(() => {
      clearTimeout(timer);
      timer = setTimeout(() => invalidateDashboard(queryClient), 1000);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [enabled, live, queryClient]);
  return useQuery({
    queryKey: officeDashboardKey,
    queryFn: fetchOfficeDashboard,
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    // Relu à chaque ouverture de l'accueil, même si les chiffres en cache sont récents
    refetchOnMount: live ? 'always' : true,
  });
}

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

export function useOnline() {
  return useSyncExternalStore(subscribeOnline, isOnline);
}
