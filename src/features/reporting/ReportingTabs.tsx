import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/pilotage/statistiques', label: 'Statistiques' },
  { to: '/pilotage/tresorerie', label: 'Trésorerie' },
  { to: '/pilotage/rentabilite', label: 'Rentabilité' },
  { to: '/pilotage/performance', label: 'Performance' },
];

/** Onglets du pilotage (direction). */
export function ReportingTabs() {
  return (
    <nav aria-label="Pilotage" className="flex gap-1 overflow-x-auto border-b">
      {TABS.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              '-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition',
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

/** En-tête commun des écrans de pilotage. */
export function ReportingHeader() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold">Pilotage</h1>
        <p className="text-muted-foreground">Chiffre d’affaires, marges et encaissements.</p>
      </div>
      <ReportingTabs />
    </>
  );
}
