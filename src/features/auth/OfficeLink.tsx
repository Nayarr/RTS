import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { useProfile } from './useProfile';

/**
 * Lien vers un écran du bureau (OR, client, véhicule) : simple texte pour le comptable, qui n'y a
 * pas accès. `linkClassName` : l'apparence réservée au lien (soulignement).
 */
export function OfficeLink({
  to,
  className,
  linkClassName,
  children,
}: {
  to: string;
  className?: string;
  linkClassName?: string;
  children: ReactNode;
}) {
  const { data: profile } = useProfile();
  if (profile?.role === 'accountant') return <span className={className}>{children}</span>;
  return (
    <Link to={to} className={cn(className, linkClassName)}>
      {children}
    </Link>
  );
}
