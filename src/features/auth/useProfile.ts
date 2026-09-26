import { useQuery } from '@tanstack/react-query';
import { fetchProfile } from './api';
import { useAuth } from './auth-context';

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

/** Profil (nom, rôle) du compte connecté. */
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: () => fetchProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });
}
