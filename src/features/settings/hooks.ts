import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchSettings } from './api';

export const settingsQueryKey = ['settings'] as const;

export function useSettings() {
  return useQuery({ queryKey: settingsQueryKey, queryFn: fetchSettings });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Enregistrement impossible';

/** Enregistrement d'une section des réglages : notification puis rechargement. */
export function useSaveSettings<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
