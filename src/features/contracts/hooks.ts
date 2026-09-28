import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchContracts } from './api';

export const contractsKey = ['contracts'] as const;

export const useContracts = () => useQuery({ queryKey: contractsKey, queryFn: fetchContracts });

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation sur un contrat : notification, puis rechargement des contrats, clients et véhicules. */
export function useContractMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await Promise.all(
        [contractsKey, ['clients'], ['vehicles']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
