import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { useProfile } from '@/features/auth/useProfile';
import { isTvMode } from '@/features/workshop-board/domain';

// Chaque accueil est chargé seulement pour le profil concerné.
const OfficeDashboardPage = lazy(() =>
  import('@/features/dashboard/OfficeDashboardPage').then((m) => ({ default: m.OfficeDashboardPage })),
);
const KioskPage = lazy(() => import('@/features/kiosk/KioskPage').then((m) => ({ default: m.KioskPage })));
const TechHomePage = lazy(() =>
  import('@/features/workshop/TechHomePage').then((m) => ({ default: m.TechHomePage })),
);

/** Accueil selon le profil : tableau de bord du bureau, OR du technicien, borne de pointage (ou télé). */
export function HomePage() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  // Appareil passé en écran atelier (télé) : il y retourne au démarrage.
  if ((profile.role === 'kiosk' || profile.role === 'direction') && isTvMode()) {
    return <Navigate to="/tele" replace />;
  }
  return (
    <Suspense
      fallback={
        <LoaderCircle className="mx-auto mt-16 size-8 animate-spin text-primary" aria-label="Chargement" />
      }
    >
      {profile.role === 'technician' ? (
        <TechHomePage />
      ) : profile.role === 'kiosk' ? (
        <KioskPage />
      ) : (
        <OfficeDashboardPage />
      )}
    </Suspense>
  );
}
