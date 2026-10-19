import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchCompany,
  fetchLastQuoteRequest,
  fetchSuppliers,
  fetchTireBrands,
  fetchTireKpis,
  fetchTireLines,
  fetchTireLot,
  fetchTireLots,
  fetchTireMovements,
} from './api';

/** Tout le module : un changement recharge le stock, les lots, les indicateurs et les mouvements. */
export const tiresKey = ['tires'] as const;
export const suppliersKey = ['suppliers'] as const;

// Stock relu à chaque ouverture de l'écran (un arrivage ou une vente a pu passer entre-temps)
const fresh = { refetchOnMount: 'always' } as const;
export const useTireLines = () =>
  useQuery({ queryKey: [...tiresKey, 'lines'], queryFn: fetchTireLines, ...fresh });
export const useTireLots = () =>
  useQuery({ queryKey: [...tiresKey, 'lots'], queryFn: fetchTireLots, ...fresh });
export const useTireKpis = () =>
  useQuery({ queryKey: [...tiresKey, 'kpis'], queryFn: fetchTireKpis, ...fresh });
export const useTireBrands = () => useQuery({ queryKey: [...tiresKey, 'brands'], queryFn: fetchTireBrands });
export const useSuppliers = () => useQuery({ queryKey: suppliersKey, queryFn: fetchSuppliers });
export const useCompany = () => useQuery({ queryKey: ['company', 'signature'], queryFn: fetchCompany });
export const useLastQuoteRequest = () =>
  useQuery({ queryKey: [...tiresKey, 'last-request'], queryFn: fetchLastQuoteRequest });

export const useTireLot = (id: string) =>
  useQuery({ queryKey: [...tiresKey, 'lot', id], queryFn: () => fetchTireLot(id) });

export const useTireMovements = (id: string) =>
  useQuery({ queryKey: [...tiresKey, 'movements', id], queryFn: () => fetchTireMovements(id) });

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation du stock des pneus : notification puis rechargement du module. */
export function useTireMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | ((data: TData, args: TArgs) => string) | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, args) => {
      if (successMessage) {
        toast.success(typeof successMessage === 'function' ? successMessage(data, args) : successMessage);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: tiresKey }),
        queryClient.invalidateQueries({ queryKey: suppliersKey }),
      ]);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
