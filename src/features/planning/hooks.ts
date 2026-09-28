import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repairOrdersKey } from '@/features/repair-orders/hooks';
import { fetchPlannableOrders, fetchPlanning, fetchUpcomingAppointments } from './api';

export const planningKey = ['planning'] as const;
export const appointmentsKey = ['appointments'] as const;

/** Rafraîchissement régulier : le planning bouge pendant la journée. */
const LIVE = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const;

export function usePlanning(from: string, to: string) {
  return useQuery({ queryKey: [...planningKey, from, to], queryFn: () => fetchPlanning(from, to), ...LIVE });
}

export function useUpcomingAppointments(today: string) {
  return useQuery({
    queryKey: [...appointmentsKey, 'upcoming', today],
    queryFn: () => fetchUpcomingAppointments(today),
    ...LIVE,
  });
}

export function usePlannableOrders(enabled: boolean) {
  return useQuery({ queryKey: [...repairOrdersKey, 'plannable'], queryFn: fetchPlannableOrders, enabled });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation du planning : notification, puis rechargement du planning, des rendez-vous et des OR. */
export function usePlanningMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (successMessage !== null) toast.success(successMessage);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: planningKey }),
        queryClient.invalidateQueries({ queryKey: appointmentsKey }),
        queryClient.invalidateQueries({ queryKey: repairOrdersKey }),
        queryClient.invalidateQueries({ queryKey: ['contracts'] }),
      ]);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
