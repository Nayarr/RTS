import type { FormEventHandler, ReactNode } from 'react';
import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AUTO_SAVE_LABELS, type AutoSaveState } from '@/lib/use-auto-save';
import { cn } from '@/lib/utils';

/** État de l'enregistrement automatique, à la place des boutons. */
export function AutoSaveStatus({ state }: { state: AutoSaveState }) {
  const Icon = state === 'saving' ? LoaderCircle : state === 'error' ? CircleAlert : Check;
  return (
    <span
      role="status"
      className={cn('hint row gap-1.5', state === 'error' && 'text-destructive!')}
      aria-live="polite"
    >
      <Icon className={cn('i xs', state === 'saving' && 'animate-spin')} aria-hidden />
      {AUTO_SAVE_LABELS[state]}
    </span>
  );
}

/**
 * Section de formulaire enregistrée d’un bloc (réglages, fiche OR…).
 * Par défaut (réglages) : titre et explication en haut, bouton « Enregistrer » en pied de carte.
 * `compact` (fiche OR) : explication à côté du titre, bouton dans l’en-tête.
 * `autoSave` : enregistrement automatique, l’état remplace les boutons.
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
  autoSave,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  dirty?: boolean;
  pending?: boolean;
  onCancel?: () => void;
  compact?: boolean;
  autoSave?: AutoSaveState;
  children: ReactNode;
}) {
  const buttons = autoSave ? (
    <AutoSaveStatus state={autoSave} />
  ) : (
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
      <form
        id={id}
        onSubmit={onSubmit ?? ((event) => event.preventDefault())}
        noValidate
        className={cn(compact ? 'card-b space-y-4' : 'form')}
      >
        {children}
      </form>
      {!compact && <div className="save">{buttons}</div>}
    </section>
  );
}
