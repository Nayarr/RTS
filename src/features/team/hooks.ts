import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchRestReferenceMonday, fetchTeam } from './api';

export const teamQueryKey = ['team'] as const;
export const restReferenceQueryKey = ['app-settings', 'rest-reference-monday'] as const;

export function useTeam() {
  return useQuery({ queryKey: teamQueryKey, queryFn: fetchTeam });
}

export function useRestReferenceMonday() {
  return useQuery({ queryKey: restReferenceQueryKey, queryFn: fetchRestReferenceMonday });
}

/** Les messages levés par la base (garde-fous, PIN en double…) sont déjà rédigés en français. */
const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/**
 * Mutation de l'écran Équipe : notification de succès / d'erreur et
 * rafraîchissement de la liste.
 */
export function useTeamMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  successMessage: string | ((args: TArgs) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, args) => {
      toast.success(typeof successMessage === 'function' ? successMessage(args) : successMessage);
      return queryClient.invalidateQueries({ queryKey: teamQueryKey });
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });
}
