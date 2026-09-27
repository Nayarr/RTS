import { Link, Outlet } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { Button } from '@/components/ui/button';
import type { AppRole } from './roles';
import { useProfile } from './useProfile';

/**
 * Réserve un groupe de pages à certains rôles (à placer sous <RequireAuth />).
 * Confort d'interface uniquement : les droits réels sont appliqués par la base (RLS).
 */
export function RequireRole({ roles }: { roles: AppRole[] }) {
  const { data: profile } = useProfile();

  if (!profile || !roles.includes(profile.role)) {
    return (
      <FullPageMessage title="Accès refusé">
        <p className="text-muted-foreground">Cette page est réservée à d’autres profils.</p>
        <Button asChild>
          <Link to="/">Retour à l’accueil</Link>
        </Button>
      </FullPageMessage>
    );
  }
  return <Outlet />;
}
