import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Champ de recherche d'une liste (loupe à gauche). */
export function SearchField({ className, ...props }: ComponentProps<'input'> & { 'aria-label': string }) {
  return (
    <label className={cn('srch w-full sm:max-w-[420px]', className)}>
      <Search className="i s" />
      <input type="search" className="inp" {...props} />
    </label>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Pastille de couleur devant le libellé (statut). */
  color?: string;
}

/** Filtres en pastilles arrondies (la sélection est en noir). */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('chips', className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cn('chip', option.value === value && 'on')}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.color && <span className="sw" style={{ '--c': option.color } as CSSProperties} />}
          {option.label}
          {option.count !== undefined && (
            <>
              {' '}
              <span className="n">{option.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

/** Numéros de page, avec « … » quand il y en a beaucoup. */
function pageNumbers(page: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);
  const pages = new Set([0, count - 1, page - 1, page, page + 1].filter((p) => p >= 0 && p < count));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, index) => (index > 0 && p - sorted[index - 1]! > 1 ? [null, p] : [p]));
}

export function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button
        type="button"
        className="cursor-pointer disabled:opacity-40"
        aria-label="Page précédente"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="i s" />
      </button>
      {pageNumbers(page, pageCount).map((p, index) =>
        p === null ? (
          <span key={`gap-${index}`}>…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={cn('cursor-pointer', p === page && 'on')}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onChange(p)}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        type="button"
        className="cursor-pointer disabled:opacity-40"
        aria-label="Page suivante"
        disabled={page === pageCount - 1}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="i s" />
      </button>
    </nav>
  );
}

/** Pied de tableau : total affiché à gauche, pages à droite. */
export function TableFooterBar({ children, pager }: { children: ReactNode; pager?: ReactNode }) {
  return (
    <div className="tfoot flex-wrap">
      <span className="muted text-[13px]">{children}</span>
      {pager}
    </div>
  );
}
