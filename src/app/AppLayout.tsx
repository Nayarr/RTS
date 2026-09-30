import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigation } from 'react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { CalendarDays, CircleHelp, LogOut, Menu, Moon, Sun, Wrench } from 'lucide-react';
import { signOut } from '@/features/auth/api';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';
import { PushBanner } from '@/features/push/PushBanner';
import { setTheme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { PageHeaderSlotContext } from './page-header-slot';
import { Sidebar } from './Sidebar';

/** Fine barre sous la barre de titre pendant le chargement d'un écran (première ouverture). */
function LoadingBar() {
  const navigation = useNavigation();
  if (navigation.state !== 'loading') return null;
  return (
    <div
      role="progressbar"
      aria-label="Chargement de l’écran"
      className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary"
    />
  );
}

function MobileBrand({ subtitle }: { subtitle: string }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Accueil">
      <img src="/icons/icon-192.png" alt="" className="size-[34px] rounded-lg bg-white p-0.5" />
      <span className="flex flex-col">
        <b className="font-display text-[19px] leading-none font-bold">RTS Atelier</b>
        <span className="hint text-[11px]">{subtitle}</span>
      </span>
    </Link>
  );
}

/** Bureau : barre latérale (menu déroulant sur téléphone), barre de titre de la page, contenu. */
function OfficeLayout() {
  const { data: profile } = useProfile();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <Sidebar className="sticky top-0 hidden h-dvh lg:flex print:hidden" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mbar sticky top-0 z-30 lg:hidden print:hidden">
          <MobileBrand subtitle={profile ? ROLE_LABELS[profile.role] : ''} />
          <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogPrimitive.Trigger className="ibtn" aria-label="Menu">
              <Menu className="size-[18px]" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(12,14,12,.42)] data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:bg-black/60" />
              <DialogPrimitive.Content
                aria-describedby={undefined}
                className="fixed inset-y-0 left-0 z-50 flex outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
              >
                <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
                <Sidebar className="h-dvh max-w-[85vw]" onNavigate={() => setMenuOpen(false)} />
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </header>
        <div ref={setSlot} className="relative z-20 lg:sticky lg:top-0 print:hidden">
          <LoadingBar />
        </div>
        <main className="flex flex-1 flex-col gap-5 px-4 pt-5 pb-8 lg:px-8 lg:pt-6">
          {profile && <PushBanner />}
          <PageHeaderSlotContext.Provider value={slot}>
            <Outlet />
          </PageHeaderSlotContext.Provider>
        </main>
      </div>
    </div>
  );
}

/** Technicien : appli de téléphone, barre du haut et onglets en bas. */
function TechnicianLayout() {
  const theme = useTheme();
  const tab = ({ isActive }: { isActive: boolean }) => cn(isActive && 'on');
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mbar sticky top-0 z-30 print:hidden">
        <MobileBrand subtitle="Technicien" />
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="ibtn"
            aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
          <button type="button" className="ibtn" aria-label="Se déconnecter" onClick={() => void signOut()}>
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 px-4 pt-3.5 pb-28">
        <PushBanner />
        <Outlet />
      </main>
      <nav className="tabbar print:hidden" aria-label="Navigation">
        <NavLink to="/" end className={tab}>
          <Wrench className="size-[22px]" />
          Mes OR
        </NavLink>
        <Link to="/#conges">
          <CalendarDays className="size-[22px]" />
          Congés
        </Link>
        <NavLink to="/aide" className={tab}>
          <CircleHelp className="size-[22px]" />
          Aide
        </NavLink>
      </nav>
    </div>
  );
}

/** Coquille de l'appli connectée, selon le profil. */
export function AppLayout() {
  const { data: profile } = useProfile();
  if (profile?.role === 'technician') return <TechnicianLayout />;
  // Borne de pointage : plein écran, sans menu.
  if (profile?.role === 'kiosk') {
    return (
      <main className="min-h-dvh">
        <Outlet />
      </main>
    );
  }
  return <OfficeLayout />;
}
