import { Link, NavLink, Outlet } from 'react-router';
import {
  CalendarClock,
  CalendarDays,
  Clock,
  FileText,
  House,
  LogOut,
  Package,
  Receipt,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Brand } from '@/components/Brand';
import { Button } from '@/components/ui/button';
import { AlertsBell } from '@/features/alerts/AlertsBell';
import { signOut } from '@/features/auth/api';
import { ROLE_LABELS, type AppRole } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
}

/** Navigation principale : chaque rôle ne voit que ses écrans. */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Accueil', icon: House, roles: ['direction', 'reception', 'technician', 'kiosk'] },
  { to: '/or', label: 'Ordres de réparation', icon: Wrench, roles: ['direction', 'reception'] },
  { to: '/planning', label: 'Planning', icon: CalendarDays, roles: ['direction', 'reception'] },
  { to: '/rendez-vous', label: 'Rendez-vous', icon: CalendarClock, roles: ['direction', 'reception'] },
  { to: '/devis', label: 'Devis', icon: FileText, roles: ['direction', 'reception'] },
  { to: '/factures', label: 'Facturation', icon: Receipt, roles: ['direction', 'reception'] },
  { to: '/pointages', label: 'Pointages', icon: Clock, roles: ['direction'] },
  { to: '/stock', label: 'Stock', icon: Package, roles: ['direction'] },
  { to: '/equipe', label: 'Équipe', icon: Users, roles: ['direction'] },
  { to: '/reglages', label: 'Réglages', icon: Settings, roles: ['direction'] },
];

/** Coquille de l'appli connectée : en-tête, navigation, contenu de la page. */
export function AppLayout() {
  const { data: profile } = useProfile();
  const items = profile ? NAV_ITEMS.filter((item) => item.roles.includes(profile.role)) : [];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" aria-label="Accueil">
            <Brand subtitle={profile ? ROLE_LABELS[profile.role] : undefined} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{profile?.full_name}</span>
            {(profile?.role === 'direction' || profile?.role === 'reception') && <AlertsBell />}
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Se déconnecter">
              <LogOut />
            </Button>
          </div>
        </div>
        {items.length > 1 && (
          <nav
            aria-label="Navigation principale"
            className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2"
          >
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
