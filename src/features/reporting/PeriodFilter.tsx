import { FilterChips } from '@/components/ListControls';
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
    <FilterChips
      label="Période"
      value={value}
      onChange={onChange}
      options={periods.map((period) => ({ value: period, label: PERIOD_LABELS[period] }))}
    />
  );
}
