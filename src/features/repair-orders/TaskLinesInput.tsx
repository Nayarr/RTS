import { useEffect, useRef } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TaskLinesInputProps {
  /** Identifiant du premier champ (relié au libellé « Tâche à faire »). */
  id: string;
  /** Tâches, une par ligne (texte de la colonne requested_work). */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}

const toRows = (value: string) => (value === '' ? [''] : value.split('\n'));

/**
 * « Tâche à faire » saisie ligne par ligne : un champ par tâche, Entrée ou « Ajouter une tâche »
 * ouvre la ligne suivante. Plus de retour à la ligne glissé au milieu d'une tâche.
 * Un texte collé sur plusieurs lignes donne une tâche par ligne.
 */
export function TaskLinesInput({ id, value, onChange, onBlur, invalid, describedBy }: TaskLinesInputProps) {
  const rows = toRows(value);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // Ligne à activer une fois la liste mise à jour (ajoutée, retirée, collée)
  const pendingFocus = useRef<number | null>(null);
  const setFocus = (index: number) => {
    pendingFocus.current = index;
  };

  useEffect(() => {
    if (pendingFocus.current === null) return;
    inputs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  });

  const emit = (next: string[]) => onChange(next.join('\n'));
  const setRow = (index: number, text: string) => emit(rows.map((row, i) => (i === index ? text : row)));
  const insertAfter = (index: number, texts: string[] = ['']) => {
    emit([...rows.slice(0, index + 1), ...texts, ...rows.slice(index + 1)]);
    setFocus(index + texts.length);
  };
  const remove = (index: number) => {
    emit(rows.length > 1 ? rows.filter((_, i) => i !== index) : ['']);
    setFocus(Math.max(0, index - 1));
  };

  return (
    <div className="col gap-2">
      <ol className="col gap-2" aria-label="Tâches à faire">
        {rows.map((row, index) => (
          <li key={index} className="row gap-2">
            <span className="muted num w-5 shrink-0 text-right text-[13px]" aria-hidden>
              {index + 1}.
            </span>
            <Input
              ref={(element) => {
                inputs.current[index] = element;
              }}
              id={index === 0 ? id : `${id}-${index + 1}`}
              aria-label={index === 0 ? undefined : `Tâche ${index + 1}`}
              aria-invalid={invalid ? true : undefined}
              aria-describedby={describedBy}
              placeholder={index === 0 ? 'Description de l’intervention demandée' : 'Tâche suivante'}
              value={row}
              maxLength={300}
              onBlur={onBlur}
              onChange={(event) => setRow(index, event.target.value)}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text');
                if (!pasted.includes('\n')) return;
                event.preventDefault();
                const [first = '', ...rest] = pasted
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                const merged = rows.map((current, i) => (i === index ? `${current}${first}` : current));
                emit([...merged.slice(0, index + 1), ...rest, ...merged.slice(index + 1)]);
                setFocus(index + rest.length);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // Entrée : tâche suivante (jamais l'envoi du formulaire)
                  event.preventDefault();
                  if (row.trim()) insertAfter(index);
                } else if (event.key === 'Backspace' && row === '' && rows.length > 1) {
                  event.preventDefault();
                  remove(index);
                }
              }}
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label={`Retirer la tâche ${index + 1}`}
                onClick={() => remove(index)}
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => insertAfter(rows.length - 1)}
      >
        <Plus /> Ajouter une tâche
      </Button>
    </div>
  );
}
