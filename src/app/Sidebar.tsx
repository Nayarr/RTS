import { useState, type CSSProperties } from 'react';
import { Link, useLocation } from 'react-router';
import {
  AudioLines,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  House,
  LogOut,
  Moon,
  Settings,
  Sun,
  Tv,
} from 'lucide-react';
import { signOut } from '@/features/auth/api';
import { ROLE_LABELS } from '@/features/auth/roles';
import { useProfile } from '@/features/auth/useProfile';
import { useOfficeDashboard } from '@/features/dashboard/hooks';
import { GlobalSearch } from '@/features/search/GlobalSearch';
import { setTheme, useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { activePath, GROUPS, initials, SECTION_ROLES, type NavGroup } from './nav';

function ThemeSwitch() {
  const theme = useTheme();
  return (
    <div className="theme-sw" role="group" aria-label="Thème">
      <button
        type="button"
        className={cn('h-[30px] cursor-pointer', theme === 'light' && 'on')}
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
      >
        <Sun className="size-3.5" /> Clair
      </button>
      <button
        type="button"
        className={cn('h-[30px] cursor-pointer', theme === 'dark' && 'on')}
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
      >
        <Moon className="size-3.5" /> Sombre
      </button>
    </div>
  );
}

/** Barre latérale du bureau : logo, recherche, menu par groupes repliables, réglages, thème, compte. */
export function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { data: profile } = useProfile();
  const { pathname } = useLocation();
  const role = profile?.role;
  const isOffice = role === 'direction' || role === 'reception';
  const dashboard = useOfficeDashboard({ enabled: isOffice });

  const current = activePath(pathname);
  const activeGroup = GROUPS.find((group) => group.items.some((item) => item.to === current))?.id;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    activeGroup ? { [activeGroup]: true } : {},
  );
  // Page ouverte depuis un lien (tableau de bord, alerte) : son groupe se déplie.
  const [shownGroup, setShownGroup] = useState(activeGroup);
  if (activeGroup !== shownGroup) {
    setShownGroup(activeGroup);
    if (activeGroup && !open[activeGroup]) setOpen({ ...open, [activeGroup]: true });
  }

  // Groupes et entrées du rôle connecté
  const groups = (section: NavGroup['section']) =>
    role
      ? GROUPS.filter(
          (group) => group.section === section && (group.roles ?? SECTION_ROLES[section]).includes(role),
        ).map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
        }))
      : [];

  const renderGroup = (group: NavGroup) => {
    const isOpen = Boolean(open[group.id]);
    const Icon = group.icon;
    const [first] = group.items;
    if (group.direct && first) {
      const count = dashboard.data && first.count && role ? first.count(dashboard.data, role) : 0;
      return (
        <Link
          key={group.id}
          to={first.to}
          className={cn('ni', first.to === current && 'on')}
          aria-current={first.to === current ? 'page' : undefined}
          onClick={onNavigate}
        >
          <Icon className="size-[18px]" />
          <span>{group.label}</span>
          {count > 0 && <span className={cn('cnt', first.hot && 'hot')}>{count}</span>}
        </Link>
      );
    }
    const listId = `nav-${group.id}`;
    return (
      <div key={group.id}>
        <button
          type="button"
          className={cn('ni', group.id === activeGroup && 'has')}
          aria-expanded={isOpen}
          aria-controls={listId}
          onClick={() => setOpen({ ...open, [group.id]: !isOpen })}
        >
          <Icon className="size-[18px]" />
          <span>{group.label}</span>
          <ChevronDown className={cn('chev', isOpen && 'open')} />
        </button>
        {/* Toujours rendu pour animer l'ouverture et la fermeture ; replié, il sort de l'arbre d'accessibilité. */}
        <div
          className={cn('subnav-fold', isOpen && 'open')}
          id={listId}
          aria-hidden={isOpen ? undefined : true}
          inert={!isOpen}
        >
          <div>
            <div className="subnav">
              {group.items.map((item) => {
                const count = dashboard.data && item.count && role ? item.count(dashboard.data, role) : 0;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn('si', item.to === current && 'on')}
                    aria-current={item.to === current ? 'page' : undefined}
                    onClick={onNavigate}
                  >
                    <span>{item.label}</span>
                    {count > 0 && <span className={cn('cnt', item.hot && 'hot')}>{count}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const ops = groups('ops');
  const mgmt = groups('mgmt');
  const name = profile?.full_name || profile?.email || '';

  return (
    <aside className={cn('side', className)}>
      <Link to="/" className="brand" onClick={onNavigate}>
        <img src="/icons/icon-192.png" alt="" />
        <div className="grow">
          <b>RTS Atelier</b>
          <small>Rapid Truck Service</small>
        </div>
      </Link>
      {isOffice && <GlobalSearch />}
      <nav className="nav" aria-label="Navigation principale">
        {/* Toujours visible en haut du menu : seuls les groupes défilent dessous. */}
        <Link
          to="/"
          className={cn('ni', current === '/' && 'on')}
          aria-current={current === '/' ? 'page' : undefined}
          onClick={onNavigate}
        >
          <House className="size-[18px]" />
          <span>{isOffice ? 'Tableau de bord' : 'Accueil'}</span>
        </Link>
        {isOffice && (
          <Link
            to="/agent-direction"
            className={cn('ni', current === '/agent-direction' && 'on')}
            aria-current={current === '/agent-direction' ? 'page' : undefined}
            onClick={onNavigate}
          >
            <AudioLines className="size-[18px]" />
            <span>Agent Direction</span>
            <span className="voix">Voix</span>
          </Link>
        )}
        {isOffice && (
          // Mails reçus, rangés par l'agent : accessibles depuis le menu, sans passer par l'agent
          <div className="subnav">
            <Link
              to="/agent-direction/mails"
              className={cn('si', current === '/agent-direction/mails' && 'on')}
              aria-current={current === '/agent-direction/mails' ? 'page' : undefined}
              onClick={onNavigate}
            >
              <span>Mails reçus</span>
            </Link>
          </div>
        )}
        {isOffice && (
          // Agenda personnel : les rendez-vous du compte connecté
          <Link
            to="/agenda"
            className={cn('ni', current === '/agenda' && 'on')}
            aria-current={current === '/agenda' ? 'page' : undefined}
            onClick={onNavigate}
          >
            <CalendarDays className="size-[18px]" />
            <span>Mon agenda</span>
          </Link>
        )}
        <div className="nav-scroll">
          {ops.length > 0 && <div className="overline">Opérations</div>}
          {ops.map(renderGroup)}
          {mgmt.length > 0 && <div className="overline">Gestion</div>}
          {mgmt.map(renderGroup)}
        </div>
      </nav>
      <div className="side-foot">
        {role === 'direction' && (
          <Link
            to="/reglages"
            className={cn('ni', current === '/reglages' && 'on')}
            aria-current={current === '/reglages' ? 'page' : undefined}
            onClick={onNavigate}
          >
            <Settings className="size-[18px]" />
            <span>Réglages</span>
          </Link>
        )}
        {role !== 'kiosk' && (
          <Link
            to="/aide"
            className={cn('ni', current === '/aide' && 'on')}
            aria-current={current === '/aide' ? 'page' : undefined}
            onClick={onNavigate}
          >
            <CircleHelp className="size-[18px]" />
            <span>Aide</span>
          </Link>
        )}
        {role === 'direction' && (
          <Link to="/tele" className="ni" onClick={onNavigate}>
            <Tv className="size-[18px]" />
            <span>Écran atelier (télé)</span>
          </Link>
        )}
        <ThemeSwitch />
        <div className="user">
          <span className="av" style={{ '--c': '#137017' } as CSSProperties}>
            {initials(name)}
          </span>
          <div className="min-w-0 grow">
            <b className="truncate">{name}</b>
            <small>{role ? ROLE_LABELS[role] : ''}</small>
          </div>
          <button
            type="button"
            className="ibtn sm ghost"
            aria-label="Se déconnecter"
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
