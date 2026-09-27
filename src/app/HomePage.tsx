import { useProfile } from '@/features/auth/useProfile';
import { OfficeDashboardPage } from '@/features/dashboard/OfficeDashboardPage';
import { KioskPage } from '@/features/kiosk/KioskPage';
import { TechHomePage } from '@/features/workshop/TechHomePage';

/** Accueil selon le profil : tableau de bord du bureau, OR du technicien, borne de pointage. */
export function HomePage() {
  const { data: profile } = useProfile();
  if (!profile) return null;
  if (profile.role === 'technician') return <TechHomePage />;
  if (profile.role === 'kiosk') return <KioskPage />;
  return <OfficeDashboardPage />;
}
