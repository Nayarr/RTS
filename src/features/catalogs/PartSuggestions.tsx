import { useDebounced } from '@/lib/use-debounced';
import { formatEuro } from '@/lib/numbers';
import type { Part } from './api';
import { useParts } from './hooks';

/**
 * Pièces de la base proposées pendant la saisie de la désignation (ou de la référence) : un clic
 * remplit la fenêtre, pour repartir d'une pièce connue et ne changer que ce qu'il faut.
 */
export function PartSuggestions({
  text,
  hidden,
  onPick,
}: {
  /** Désignation ou référence en cours de saisie. */
  text: string;
  /** Pièce déjà reprise : plus de propositions. */
  hidden: boolean;
  onPick: (part: Part) => void;
}) {
  const search = useDebounced(hidden ? '' : text, 250);
  const parts = useParts(search.trim().length >= 2 ? search : '');
  const suggestions = search.trim().length >= 2 ? (parts.data ?? []).slice(0, 5) : [];
  if (hidden || suggestions.length === 0) return null;
  return (
    <ul aria-label="Pièces de la base" className="divide-y rounded-md border bg-card">
      {suggestions.map((part) => (
        <li key={part.id}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => onPick(part)}
          >
            <span>
              <span className="font-medium">{part.designation}</span>
              <span className="block text-xs text-muted-foreground">
                {[part.manufacturer_ref, part.brand, part.vehicle_ref, part.supplier_name]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="shrink-0 tabular-nums">{formatEuro(part.sale_price)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
