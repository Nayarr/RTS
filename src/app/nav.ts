import {
  ChartColumn,
  CircleDot,
  Clock,
  KeyRound,
  Package,
  Receipt,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AppRole } from '@/features/auth/roles';
import type { OfficeDashboard } from '@/features/dashboard/api';
import { DIAGNOSTIC_HELP_ENABLED } from '@/features/knowledge/flags';
import { CATEGORY_ORDER } from '@/features/repair-orders/constants';

export interface NavLeaf {
  to: string;
  label: string;
  roles?: AppRole[];
  /** Compteur affiché à droite (rouge : quelque chose attend une action). */
  count?: (data: OfficeDashboard, role: AppRole) => number;
  hot?: boolean;
}

export interface NavGroup {
  id: string;
  section: 'ops' | 'mgmt';
  /** Rôles qui voient le groupe (sinon ceux de sa partie du menu). */
  roles?: AppRole[];
  label: string;
  icon: LucideIcon;
  /** Une seule entrée, affichée comme un lien du menu (sans sous-menu à déplier). */
  direct?: boolean;
  items: NavLeaf[];
}

const activeOrders = (data: OfficeDashboard) =>
  CATEGORY_ORDER.filter((category) => category !== 'invoiced').reduce(
    (sum, category) => sum + (data.repair_orders[category] ?? 0),
    0,
  );

/** Menu du bureau, rangé comme la maquette ; la réception ne voit pas la partie « Gestion ». */
export const GROUPS: NavGroup[] = [
  {
    id: 'atelier',
    section: 'ops',
    label: 'Atelier',
    icon: Wrench,
    items: [
      { to: '/or', label: 'Ordres de réparation', count: activeOrders },
      { to: '/atelier-en-direct', label: 'Atelier en direct' },
      { to: '/planning', label: 'Planning' },
      { to: '/rendez-vous', label: 'Rendez-vous', count: (data) => data.reminders_to_send, hot: true },
      // Aide au diagnostic masquée pour le moment : la page reste joignable par son adresse
      ...(DIAGNOSTIC_HELP_ENABLED
        ? [{ to: '/documentation', label: 'Documentation technique', roles: ['direction'] as AppRole[] }]
        : []),
    ],
  },
  {
    id: 'clients',
    section: 'ops',
    label: 'Clients',
    icon: Users,
    items: [
      { to: '/clients', label: 'Clients' },
      { to: '/vehicules', label: 'Véhicules' },
      { to: '/vehicules/echeances', label: 'Échéances' },
      { to: '/contrats', label: 'Contrats' },
    ],
  },
  {
    id: 'location',
    section: 'ops',
    label: 'Location',
    icon: KeyRound,
    items: [
      { to: '/location', label: 'Vue d’ensemble' },
      { to: '/location/contrats', label: 'Locations' },
      { to: '/location/flotte', label: 'Flotte' },
    ],
  },
  {
    id: 'facturation',
    section: 'ops',
    label: 'Facturation',
    icon: Receipt,
    items: [
      { to: '/devis', label: 'Devis', count: (data) => data.quotes_awaiting_response },
      { to: '/factures', label: 'Factures', count: (data) => data.overdue_invoices.count, hot: true },
      { to: '/factures/avoirs', label: 'Avoirs' },
      { to: '/garanties', label: 'Garanties et retours' },
    ],
  },
  {
    id: 'equipe',
    section: 'mgmt',
    label: 'Équipe',
    icon: Clock,
    items: [
      { to: '/pointages', label: 'Pointages' },
      {
        to: '/pointages/conges',
        label: 'Congés et absences',
        count: (data) => data.leave_requests,
        hot: true,
      },
      { to: '/pointages/releve', label: 'Relevé d’heures' },
      { to: '/equipe', label: 'Comptes et rôles' },
    ],
  },
  {
    id: 'stock',
    section: 'mgmt',
    label: 'Stock',
    icon: Package,
    items: [
      { to: '/stock/consommables', label: 'Consommables' },
      { to: '/stock/pieces', label: 'Pièces' },
      { to: '/stock/forfaits', label: 'Forfaits' },
    ],
  },
  {
    id: 'pneumatiques',
    section: 'mgmt',
    // La réception gère le stock des pneus (arrivages, alertes du seuil mini)
    roles: ['direction', 'reception'],
    label: 'Pneumatiques',
    icon: CircleDot,
    direct: true,
    items: [{ to: '/stock/pneumatiques', label: 'Pneumatiques' }],
  },
  {
    id: 'pilotage',
    section: 'mgmt',
    label: 'Pilotage',
    icon: ChartColumn,
    items: [
      { to: '/pilotage/statistiques', label: 'Statistiques' },
      { to: '/pilotage/tresorerie', label: 'Trésorerie' },
      { to: '/pilotage/rentabilite', label: 'Rentabilité' },
      { to: '/pilotage/performance', label: 'Performance' },
    ],
  },
];

export const NAV_PATHS = [
  ...GROUPS.flatMap((group) => group.items.map((item) => item.to)),
  '/agent-direction',
  '/agent-direction/mails',
  '/reglages',
  '/aide',
];

export const SECTION_ROLES: Record<NavGroup['section'], AppRole[]> = {
  ops: ['direction', 'reception'],
  mgmt: ['direction'],
};

/** Entrée du menu de la page ouverte : le chemin le plus précis qui la contient. */
export function activePath(pathname: string): string | null {
  if (pathname === '/') return '/';
  const matches = NAV_PATHS.filter((path) => pathname === path || pathname.startsWith(`${path}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}
