import { Fragment, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeaderSlotContext } from './page-header-slot';

export interface Crumb {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  /** Fil d'Ariane : la dernière étape est la page ouverte (en gras). */
  crumbs?: Crumb[];
  title: ReactNode;
  /** Bouton retour à gauche du titre. */
  back?: { to: string; label: string };
  /** Boutons et informations à droite. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Barre de titre de la page (maquette : fil d'Ariane, titre, actions à droite).
 * Affichée dans la coquille, au-dessus du contenu ; sans coquille (tests), à sa place.
 */
export function PageHeader({ crumbs, title, back, actions, className }: PageHeaderProps) {
  const slot = useContext(PageHeaderSlotContext);
  const header = (
    <header className={cn('topbar h-auto! min-h-[68px] flex-wrap px-4 py-2.5 lg:px-8', className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        {back && (
          <Link to={back.to} className="ibtn" aria-label={back.label}>
            <ArrowLeft className="size-[18px]" />
          </Link>
        )}
        <div className="flex min-w-0 flex-col gap-0.5">
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="Fil d’Ariane" className="crumbs flex-wrap">
              {crumbs.map((crumb, index) => {
                const last = index === crumbs.length - 1;
                return (
                  <Fragment key={`${crumb.label}-${index}`}>
                    {index > 0 && <span aria-hidden>/</span>}
                    {last && crumbs.length > 1 ? (
                      <b>{crumb.label}</b>
                    ) : crumb.to ? (
                      <Link to={crumb.to} className="hover:text-foreground">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span>{crumb.label}</span>
                    )}
                  </Fragment>
                );
              })}
            </nav>
          )}
          <h1 className="title flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">{title}</h1>
        </div>
      </div>
      {actions && <div className="actions flex-wrap">{actions}</div>}
    </header>
  );
  return slot ? createPortal(header, slot) : header;
}
