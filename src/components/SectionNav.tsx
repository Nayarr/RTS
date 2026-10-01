import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';

export interface SectionLink {
  to: string;
  label: string;
  count?: number | undefined;
}

/**
 * Écrans voisins d'une même rubrique (une URL par écran) : boutons groupés (« seg »)
 * ou onglets soulignés (« tabs », pilotage), comme la maquette.
 */
export function SectionNav({
  label,
  links,
  variant = 'seg',
  className,
}: {
  label: string;
  links: SectionLink[];
  variant?: 'seg' | 'tabs';
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn(variant, 'max-w-full overflow-x-auto', className)}>
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end className={({ isActive }) => cn(isActive && 'on')}>
          {link.label}
          {link.count ? (
            <>
              {' '}
              <span className="n">{link.count}</span>
            </>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
