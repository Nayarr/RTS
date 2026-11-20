import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repairOrderKey, repairOrdersKey } from '@/features/repair-orders/hooks';
import { fetchPartCores, fetchRepairOrderCores } from './api';

export const partCoresKey = ['part-cores'] as const;

export const usePartCores = () => useQuery({ queryKey: partCoresKey, queryFn: fetchPartCores });

/** Consignes des pièces de l'OR : rechargées avec la fiche. */
export const useRepairOrderCores = (repairOrderId: string) =>
  useQuery({
    queryKey: [...repairOrderKey(repairOrderId), 'cores'],
    queryFn: () => fetchRepairOrderCores(repairOrderId),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation d'une consigne : notification, puis rechargement des consignes et des OR (historique). */
export function usePartCoreMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | ((args: TArgs) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (_data, args) => {
      toast.success(typeof successMessage === 'function' ? successMessage(args) : successMessage);
      await Promise.all(
        [partCoresKey, repairOrdersKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
