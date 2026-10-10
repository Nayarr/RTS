import { useEffect, useRef, useState } from 'react';
import { useWatch, type FieldValues, type UseFormReturn } from 'react-hook-form';

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Pause de frappe avant l'enregistrement. */
export const AUTO_SAVE_DELAY_MS = 800;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Champs dont la valeur diffère de la référence (dernière valeur enregistrée ou relue). */
export function changedFields<T extends FieldValues>(
  values: T,
  reference: Partial<T> | undefined,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([key, value]) => !same(value, reference?.[key as keyof T])),
  ) as Partial<T>;
}

/**
 * Enregistrement automatique d'un formulaire (plus de bouton « Enregistrer ») : après une courte
 * pause de frappe, les champs modifiés et valides sont enregistrés (`save` reçoit seulement ces
 * champs : deux personnes qui modifient des champs différents ne s'écrasent pas). Une saisie
 * faite pendant l'envoi est enregistrée juste après. Le formulaire relit ses valeurs avec
 * `resetOptions: { keepDirtyValues: true }` pour ne pas écraser une saisie en cours.
 */
export function useAutoSave<T extends FieldValues>(
  form: UseFormReturn<T>,
  save: (changed: Partial<T>) => Promise<unknown>,
  delay = AUTO_SAVE_DELAY_MS,
) {
  const values = useWatch({ control: form.control });
  const [state, setState] = useState<AutoSaveState>('idle');
  const [round, setRound] = useState(0);
  const saving = useRef(false);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    if (saving.current) return;
    const reference = form.formState.defaultValues as Partial<T> | undefined;
    if (same(values, reference)) return;
    const timer = window.setTimeout(() => {
      void form.handleSubmit(async (submitted) => {
        const changed = changedFields(submitted, form.formState.defaultValues as Partial<T> | undefined);
        if (Object.keys(changed).length === 0) return;
        saving.current = true;
        setState('saving');
        try {
          await saveRef.current(changed);
          // Valeurs envoyées = nouvelle référence ; une saisie faite entre-temps reste à enregistrer.
          form.reset(submitted, { keepValues: true, keepErrors: true });
          setState('saved');
          saving.current = false;
          setRound((count) => count + 1);
        } catch {
          // Pas de nouvel essai en boucle : la prochaine modification relance l'enregistrement.
          saving.current = false;
          setState('error');
        }
      })();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [values, round, delay, form]);

  return state;
}

/** Texte affiché à côté du titre du formulaire. */
export const AUTO_SAVE_LABELS: Record<AutoSaveState, string> = {
  idle: 'Enregistrement automatique',
  saving: 'Enregistrement…',
  saved: 'Enregistré',
  error: 'Erreur : modification non enregistrée',
};
