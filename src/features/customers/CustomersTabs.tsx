import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

/** Onglets clients / véhicules / échéances / contrats d'entretien. */
export function CustomersTabs() {
  const tab = (to: string, label: string) => (
    <NavLink
      to={to}
      end
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
  );
  return (
    <nav aria-label="Clients et véhicules" className="flex gap-1 overflow-x-auto border-b">
      {tab('/clients', 'Clients')}
      {tab('/vehicules', 'Véhicules')}
      {tab('/vehicules/echeances', 'Échéances')}
      {tab('/contrats', 'Contrats')}
    </nav>
  );
}
