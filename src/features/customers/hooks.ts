import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchClient, fetchClients, fetchDeadlines, fetchVehicle, fetchVehicles } from './api';

export const clientsKey = ['clients'] as const;
export const vehiclesKey = ['vehicles'] as const;

export const useClients = () => useQuery({ queryKey: [...clientsKey, 'list'], queryFn: fetchClients });
export const useClient = (id: string) =>
  useQuery({ queryKey: [...clientsKey, id], queryFn: () => fetchClient(id) });
export const useVehicles = () => useQuery({ queryKey: [...vehiclesKey, 'list'], queryFn: fetchVehicles });
export const useVehicle = (id: string) =>
  useQuery({ queryKey: [...vehiclesKey, id], queryFn: () => fetchVehicle(id) });
export const useDeadlines = () =>
  useQuery({ queryKey: [...vehiclesKey, 'deadlines'], queryFn: fetchDeadlines });

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation sur un client ou un véhicule : notification puis rechargement des fiches. */
export function useCustomerMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await Promise.all(
        [clientsKey, vehiclesKey, ['repair-orders']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
