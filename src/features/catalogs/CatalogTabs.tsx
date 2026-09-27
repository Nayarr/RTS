import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/stock/consommables', label: 'Consommables' },
  { to: '/stock/pieces', label: 'Catalogue pièces' },
];

/** Onglets des catalogues (une URL par onglet : lien direct depuis les alertes de stock). */
export function CatalogTabs() {
  return (
    <nav aria-label="Catalogues" className="flex gap-1 border-b">
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
