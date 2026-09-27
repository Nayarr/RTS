import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchLeaveRequests } from './api';

export const leaveKey = ['leave-requests'] as const;

export function useLeaveRequests() {
  return useQuery({ queryKey: leaveKey, queryFn: fetchLeaveRequests, refetchOnWindowFocus: true });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation des congés : notification, puis rechargement des congés, du planning et des pointages. */
export function useLeaveMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await Promise.all(
        [leaveKey, ['planning'], ['attendance']].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
