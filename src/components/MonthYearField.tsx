import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/**
 * Mois et année seulement (échéance du contrôle hayon) : deux listes, lisibles sur tous les
 * navigateurs, téléphone compris. Valeur au 1er jour du mois (« 2025-05-01 »), ou vide.
 */
export function MonthYearField({
  id,
  label,
  value,
  onChange,
  disabled,
  error,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | undefined;
  className?: string;
}) {
  const month = value ? value.slice(5, 7) : '';
  const year = value ? value.slice(0, 4) : '';
  const current = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, index) => String(current - 3 + index));
  if (year && !years.includes(year)) years.unshift(year);
  // « Mois » ou « Année » remis à vide : échéance effacée. Une seule liste choisie : l'autre prend
  // le mois ou l'année du jour.
  const change = (nextMonth: string, nextYear: string) => {
    if (!nextMonth || !nextYear) {
      if ((!nextMonth && month) || (!nextYear && year)) return onChange('');
    }
    const fallbackMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    onChange(`${nextYear || current}-${nextMonth || fallbackMonth}-01`);
  };
  return (
    <div className={cn('field', className)} role="group" aria-labelledby={`${id}-label`}>
      <Label id={`${id}-label`} htmlFor={`${id}-month`}>
        {label}
      </Label>
      <div className="row gap-2">
        <select
          id={`${id}-month`}
          aria-label={`${label} : mois`}
          className="inp grow"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          value={month}
          onChange={(event) => change(event.target.value, year)}
        >
          <option value="">Mois</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, '0')}>
              {String(index + 1).padStart(2, '0')} · {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} : année`}
          className="inp w-28! shrink-0"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          value={year}
          onChange={(event) => change(month, event.target.value)}
        >
          <option value="">Année</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}
