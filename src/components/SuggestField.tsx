import { useState, type ComponentProps, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface Suggestion {
  key: string;
  label: string;
  /** Précision affichée à droite (client du véhicule, ville…). */
  hint?: string | null;
}

interface SuggestFieldProps extends Omit<ComponentProps<typeof Input>, 'onChange' | 'value'> {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  suggestions: Suggestion[];
  onPick: (suggestion: Suggestion) => void;
  error?: string | undefined;
  hint?: string | undefined;
}

/**
 * Champ avec propositions pendant la saisie (véhicules, clients déjà en base) : flèches haut et
 * bas pour choisir, Entrée pour prendre la proposition, Échap pour fermer. La saisie libre reste
 * possible (nouveau véhicule, nouveau client).
 */
export function SuggestField({
  id,
  label,
  value,
  onValueChange,
  suggestions,
  onPick,
  error,
  hint,
  className,
  onBlur,
  ...inputProps
}: SuggestFieldProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = `${id}-suggestions`;
  const errorId = `${id}-error`;
  // Proposition identique à la saisie : rien à proposer.
  const items = suggestions.filter((item) => item.label.toLowerCase() !== value.trim().toLowerCase());
  const shown = open && items.length > 0;

  const pick = (item: Suggestion) => {
    onPick(item);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!shown) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + items.length) % items.length);
    } else if (event.key === 'Enter' && active >= 0 && items[active]) {
      event.preventDefault();
      pick(items[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="field relative">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        className={className}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(event) => {
          setOpen(false);
          onBlur?.(event);
        }}
        onKeyDown={onKeyDown}
        {...inputProps}
      />
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`Propositions : ${label}`}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-[9px] border bg-popover p-1 shadow-lg"
        >
          {items.map((item, index) => (
            <li
              key={item.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={cn(
                'row cursor-pointer justify-between gap-3 rounded-[6px] px-2.5 py-2 text-sm',
                index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
              // Garde le focus dans le champ : le clic choisit sans fermer avant.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(item)}
            >
              <span className="truncate font-medium">{item.label}</span>
              {item.hint && <span className="hint shrink-0">{item.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <p id={errorId} className="err">
          {error}
        </p>
      )}
    </div>
  );
}
