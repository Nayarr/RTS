import type { FormEventHandler, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Section de formulaire enregistrée d’un bloc (réglages, fiche OR…).
 * Par défaut (réglages) : titre et explication en haut, bouton « Enregistrer » en pied de carte.
 * `compact` (fiche OR) : explication à côté du titre, bouton dans l’en-tête.
 */
export function SectionCard({
  id,
  title,
  description,
  onSubmit,
  dirty,
  pending,
  onCancel,
  compact = false,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  dirty: boolean;
  pending: boolean;
  onCancel: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  const buttons = (
    <>
      {dirty && (
        <Button
          type="button"
          variant="ghost"
          size={compact ? 'sm' : 'default'}
          onClick={onCancel}
          disabled={pending}
        >
          Annuler les modifications
        </Button>
      )}
      <Button type="submit" form={id} size={compact ? 'sm' : 'default'} disabled={!dirty || pending}>
        {pending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </>
  );

  return (
    <section data-slot="card" className="card" aria-labelledby={`${id}-title`}>
      {compact ? (
        <div className="card-h flex-wrap">
          <div className="row wrap gap-x-3 gap-y-0.5">
            <h2 className="h2" id={`${id}-title`}>
              {title}
            </h2>
            <span className="hint">{description}</span>
          </div>
          <div className="row gap-2">{buttons}</div>
        </div>
      ) : (
        <div className="sec-h">
          <h2 className="h2" id={`${id}-title`}>
            {title}
          </h2>
          <span className="hint">{description}</span>
        </div>
      )}
      <form id={id} onSubmit={onSubmit} noValidate className={cn(compact ? 'card-b space-y-4' : 'form')}>
        {children}
      </form>
      {!compact && <div className="save">{buttons}</div>}
    </section>
  );
}
