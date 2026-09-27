import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageMessage } from '@/components/FullPageMessage';
import { Button } from '@/components/ui/button';
import { signOut } from './api';
import { useAuth } from './auth-context';
import { useProfile } from './useProfile';

/**
 * Garde des routes protégées : session obligatoire et profil actif.
 * (Les droits réels sont appliqués côté base par le RLS : ceci ne sert qu'à l'interface.)
 */
export function RequireAuth() {
  const { session, isLoading, signedOut } = useAuth();
  const location = useLocation();
  const profile = useProfile();

  if (isLoading) return <FullPageMessage />;
  if (!session) {
    // Page demandée mémorisée pour y revenir après connexion, sauf après une déconnexion :
    // le compte suivant ne doit pas être renvoyé sur l'écran de quelqu'un d'autre.
    return <Navigate to="/connexion" replace state={signedOut ? null : { from: location.pathname }} />;
  }
  if (profile.isPending) return <FullPageMessage />;

  if (profile.isError) {
    return (
      <FullPageMessage title="Impossible de charger ton profil">
        <p className="text-muted-foreground">Vérifie ta connexion internet puis réessaie.</p>
        <Button onClick={() => void profile.refetch()}>Réessayer</Button>
      </FullPageMessage>
    );
  }

  if (!profile.data?.is_active) {
    return (
      <FullPageMessage title="Compte non autorisé">
        <p className="max-w-sm text-muted-foreground">
          Le compte {session.user.email} n’a pas (ou plus) accès à l’appli. Contacte la direction.
        </p>
        <Button variant="outline" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </FullPageMessage>
    );
  }

  return <Outlet />;
}
