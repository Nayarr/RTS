import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchConsumables, fetchPackages, fetchParts, fetchPartStats } from './api';

export const consumablesKey = ['consumables'] as const;
export const partsKey = ['parts'] as const;
/** Même clé que la liste des forfaits proposés dans les devis et factures. */
export const packagesKey = ['service-packages'] as const;

export function useConsumables() {
  return useQuery({ queryKey: consumablesKey, queryFn: fetchConsumables });
}

export function usePackages() {
  return useQuery({ queryKey: [...packagesKey, 'catalog'], queryFn: fetchPackages });
}

export function usePartStats() {
  return useQuery({ queryKey: [...partsKey, 'stats'], queryFn: fetchPartStats });
}

export function useParts(search: string) {
  const term = search.trim().toLowerCase();
  return useQuery({
    queryKey: [...partsKey, term],
    queryFn: () => fetchParts(term),
    placeholderData: keepPreviousData,
  });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation d'un catalogue : notification puis rechargement des listes concernées. */
export function useCatalogMutation<TArgs, TData = unknown>(
  queryKey: readonly string[],
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | ((data: TData, args: TArgs) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data, args) => {
      toast.success(typeof successMessage === 'function' ? successMessage(data, args) : successMessage);
      return queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
