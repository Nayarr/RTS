import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fleetKey } from './fleet-hooks';
import { fetchBusyPeriods, fetchMissing, fetchRental, fetchRentals, type RentalPhase } from './rental-api';

export const rentalsKey = ['rentals'] as const;

export const useRentals = () => useQuery({ queryKey: rentalsKey, queryFn: fetchRentals });

export const useRental = (id: string) =>
  useQuery({ queryKey: [...rentalsKey, id], queryFn: () => fetchRental(id), enabled: Boolean(id) });

export const useBusyPeriods = () =>
  useQuery({ queryKey: [...rentalsKey, 'busy'], queryFn: fetchBusyPeriods });

/** Ce qui manque pour le départ ou le retour (recalculé après chaque enregistrement). */
export const useMissing = (id: string, phase: RentalPhase, enabled = true) =>
  useQuery({
    queryKey: [...rentalsKey, id, 'missing', phase],
    queryFn: () => fetchMissing(id, phase),
    enabled: Boolean(id) && enabled,
  });

/** Écriture sur un contrat : message, erreur affichée, contrats et flotte rechargés. */
export function useRentalMutation<T, R = unknown>(fn: (value: T) => Promise<R>, success?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      if (success) toast.success(success);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: rentalsKey }),
        queryClient.invalidateQueries({ queryKey: fleetKey }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Enregistrement impossible'),
  });
}
