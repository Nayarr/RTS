import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { repairOrdersKey } from '@/features/repair-orders/hooks';
import { fetchQuote, fetchQuotes, fetchRepairOrderQuotes } from './api';

export const quotesKey = ['quotes'] as const;
export const quoteKey = (id: string) => ['quotes', id] as const;

export function useQuotes() {
  return useQuery({ queryKey: quotesKey, queryFn: fetchQuotes, refetchOnWindowFocus: true });
}

export function useQuote(id: string) {
  return useQuery({ queryKey: quoteKey(id), queryFn: () => fetchQuote(id) });
}

export function useRepairOrderQuotes(repairOrderId: string) {
  return useQuery({
    queryKey: [...quotesKey, 'repair-order', repairOrderId],
    queryFn: () => fetchRepairOrderQuotes(repairOrderId),
  });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/**
 * Mutation sur un devis : notification (sauf `successMessage` null), puis rechargement
 * des devis et des OR (historique, statut).
 */
export function useQuoteMutation<TArgs, TData = unknown>(
  mutationFn: (args: TArgs) => Promise<TData>,
  successMessage: string | ((args: TArgs) => string) | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (_data, args) => {
      if (successMessage !== null) {
        toast.success(typeof successMessage === 'function' ? successMessage(args) : successMessage);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: quotesKey }),
        queryClient.invalidateQueries({ queryKey: repairOrdersKey }),
      ]);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
