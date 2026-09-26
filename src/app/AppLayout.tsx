import { Link, Outlet } from 'react-router';
import { LogOut } from 'lucide-react';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/api';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';

/** Coquille de l'appli connectée : en-tête + contenu de la page. */
export function AppLayout() {
  const { data: profile } = useProfile();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" aria-label="Accueil">
            <Brand subtitle={profile ? ROLE_LABELS[profile.role] : undefined} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{profile?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Se déconnecter">
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
