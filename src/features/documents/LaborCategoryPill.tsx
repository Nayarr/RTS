import { useState, type CSSProperties } from 'react';
import { Pencil } from 'lucide-react';
import { decimalText } from '@/lib/numbers';
import { useLaborRates } from './hooks';
import { DEFAULT_LABOR_CATEGORY, LABOR_CATEGORY_COLORS, type LaborCategory } from './lines';

/** Changement de catégorie : le prix suit le taux de la nouvelle catégorie s'il était celui de l'ancienne. */
export interface LaborCategoryPatch {
  labor_category: LaborCategory;
  unit_price?: number;
}

/**
 * Pastille de la catégorie d'une ligne de main d'œuvre (couleur propre à chaque catégorie), avec un
 * petit stylo pour la changer. Sans catégorie enregistrée : mécanique poids lourds. Un prix
 * négocié (taux du client, prix corrigé) est gardé.
 */
export function LaborCategoryPill({
  category,
  hours,
  unitPrice,
  description,
  locked,
  onChange,
}: {
  category: LaborCategory | null | undefined;
  hours?: number | null | undefined;
  unitPrice: number | null;
  description: string;
  locked: boolean;
  onChange: (patch: LaborCategoryPatch) => void;
}) {
  const rates = useLaborRates().data ?? [];
  const [editing, setEditing] = useState(false);
  const current = category ?? DEFAULT_LABOR_CATEGORY;
  const base = rates.filter((rate) => rate.category !== null);
  const label = base.find((rate) => rate.category === current)?.label ?? current.toUpperCase();
  const name = description || 'la ligne';

  if (editing) {
    return (
      <select
        aria-label={`Catégorie de main d’œuvre de ${name}`}
        className="inp mt-0.5 h-8 w-auto shrink-0 py-0 text-[13px]"
        autoFocus
        value={current}
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          setEditing(false);
          const next = event.target.value as LaborCategory;
          if (next === current) return;
          const before = base.find((rate) => rate.category === current)?.hourly_rate;
          const after = base.find((rate) => rate.category === next)?.hourly_rate;
          onChange({
            labor_category: next,
            ...(after !== undefined && unitPrice === before && { unit_price: after }),
          });
        }}
      >
        {base.map((rate) => (
          <option key={rate.id} value={rate.category ?? ''}>
            {rate.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span className="mt-1.5 inline-flex shrink-0 items-center gap-0.5">
      <span
        className="badge"
        style={{ '--c': LABOR_CATEGORY_COLORS[current] } as CSSProperties}
        aria-label={`Main d’œuvre ${label}`}
      >
        MO {label}
        {hours !== null && hours !== undefined && ` · ${decimalText(hours)} h`}
      </span>
      {!locked && (
        <button
          type="button"
          className="ibtn sm ghost size-6!"
          aria-label={`Changer la catégorie de main d’œuvre de ${name}`}
          title="Changer la catégorie de main d’œuvre"
          onClick={() => setEditing(true)}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </span>
  );
}
