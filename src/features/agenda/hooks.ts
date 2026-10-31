import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchEvents } from './api';

export const agendaKey = ['agenda'] as const;

export function useAgenda(from: string, to: string) {
  return useQuery({ queryKey: [...agendaKey, from, to], queryFn: () => fetchEvents(from, to) });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation de l'agenda : notification, puis rechargement des rendez-vous. */
export function useAgendaMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: agendaKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
