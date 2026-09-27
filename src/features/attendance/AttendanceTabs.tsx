import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

/** Onglets de l'espace RH de la direction : pointages, congés, relevé d'heures. */
export function AttendanceTabs() {
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
    <nav aria-label="Pointages et absences" className="flex gap-1 overflow-x-auto border-b">
      {tab('/pointages', 'Pointages')}
      {tab('/pointages/conges', 'Congés et absences')}
      {tab('/pointages/releve', 'Relevé d’heures')}
    </nav>
  );
}
