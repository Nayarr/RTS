import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repairOrderKey, repairOrdersKey } from '@/features/repair-orders/hooks';
import { fetchMyRepairOrders, fetchSeen, fetchVehicleDeadlines } from './api';

export const myOrdersKey = ['workshop', 'my-orders'] as const;
export const seenKey = ['workshop', 'seen'] as const;

export function useMyRepairOrders() {
  return useQuery({
    queryKey: myOrdersKey,
    queryFn: fetchMyRepairOrders,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useSeen() {
  return useQuery({ queryKey: seenKey, queryFn: fetchSeen });
}

export function useVehicleDeadlines(vehicleId: string) {
  return useQuery({
    queryKey: ['vehicles', vehicleId, 'deadlines'],
    queryFn: () => fetchVehicleDeadlines(vehicleId),
  });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Enregistrement impossible';

/**
 * Action du technicien sur un OR : les refus de la base (OR terminé, photos manquantes…)
 * sont affichés tels quels ; la fiche est rechargée dans tous les cas.
 */
export function useWorkshopMutation<TArgs, TData = unknown>(
  repairOrderId: string,
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      if (successMessage) toast.success(successMessage);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: repairOrderKey(repairOrderId) }),
        queryClient.invalidateQueries({ queryKey: myOrdersKey }),
        queryClient.invalidateQueries({ queryKey: repairOrdersKey, exact: true }),
      ]),
  });
}
