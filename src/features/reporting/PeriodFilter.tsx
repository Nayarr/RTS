import { cn } from '@/lib/utils';
import { PERIOD_LABELS, type Period } from './analysis';

export function PeriodFilter({
  periods,
  value,
  onChange,
}: {
  periods: Period[];
  value: Period;
  onChange: (period: Period) => void;
}) {
  return (
    <div role="group" aria-label="Période" className="flex gap-2 overflow-x-auto pb-1">
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          aria-pressed={value === period}
          onClick={() => onChange(period)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
            value === period ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          {PERIOD_LABELS[period]}
        </button>
      ))}
    </div>
  );
}
