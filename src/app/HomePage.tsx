import { Navigate } from 'react-router';
import { useProfile } from '@/features/auth/useProfile';
import { OfficeDashboardPage } from '@/features/dashboard/OfficeDashboardPage';
import { KioskPage } from '@/features/kiosk/KioskPage';
import { isTvMode } from '@/features/workshop-board/domain';
import { TechHomePage } from '@/features/workshop/TechHomePage';

/** Accueil selon le profil : tableau de bord du bureau, OR du technicien, borne de pointage (ou télé). */
export function HomePage() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  // Appareil passé en écran atelier (télé) : il y retourne au démarrage.
  if ((profile.role === 'kiosk' || profile.role === 'direction') && isTvMode()) {
    return <Navigate to="/tele" replace />;
  }
  if (profile.role === 'technician') return <TechHomePage />;
  if (profile.role === 'kiosk') return <KioskPage />;
  return <OfficeDashboardPage />;
}
