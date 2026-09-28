import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repairOrdersKey } from '@/features/repair-orders/hooks';
import { fetchWarrantyClaims } from './api';

export const warrantyClaimsKey = ['warranty-claims'] as const;

export const useWarrantyClaims = () =>
  useQuery({ queryKey: warrantyClaimsKey, queryFn: fetchWarrantyClaims });

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation d'un retour : notification, puis rechargement des retours et de l'historique des OR. */
export function useWarrantyMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await Promise.all(
        [warrantyClaimsKey, repairOrdersKey].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
