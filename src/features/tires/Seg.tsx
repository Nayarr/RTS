import { cn } from '@/lib/utils';

/** Choix exclusif en boutons groupés (catégorie, état, profil, filtres). */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  disabled = false,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn('seg', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          className={cn(value === option.value && 'on')}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
