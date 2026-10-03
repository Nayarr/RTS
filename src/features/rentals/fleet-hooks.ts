import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchFleet, fetchFleetDocuments, fetchFleetVehicle } from './fleet-api';

export const fleetKey = ['fleet'] as const;

export const useFleet = () => useQuery({ queryKey: fleetKey, queryFn: fetchFleet });

export const useFleetVehicle = (id: string) =>
  useQuery({ queryKey: [...fleetKey, id], queryFn: () => fetchFleetVehicle(id), enabled: Boolean(id) });

export const useFleetDocuments = (id: string) =>
  useQuery({
    queryKey: [...fleetKey, id, 'documents'],
    queryFn: () => fetchFleetDocuments(id),
    enabled: Boolean(id),
  });

/** Écriture sur la flotte : message de réussite, erreur affichée, données rechargées. */
export function useFleetMutation<T, R = unknown>(fn: (value: T) => Promise<R>, success?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (success) toast.success(success);
      await queryClient.invalidateQueries({ queryKey: fleetKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Enregistrement impossible'),
  });
}
