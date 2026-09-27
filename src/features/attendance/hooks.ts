import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchAttendanceDay, fetchKioskSettings } from './api';

export const attendanceKey = ['attendance'] as const;

export function useAttendanceDay(date: string) {
  return useQuery({
    queryKey: [...attendanceKey, 'day', date],
    queryFn: () => fetchAttendanceDay(date),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useKioskSettings() {
  return useQuery({ queryKey: [...attendanceKey, 'kiosk-settings'], queryFn: fetchKioskSettings });
}

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Opération impossible';

/** Mutation des pointages : notification puis rechargement. */
export function useAttendanceMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
  successMessage: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      toast.success(successMessage);
      await queryClient.invalidateQueries({ queryKey: attendanceKey });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
