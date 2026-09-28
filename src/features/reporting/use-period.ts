import { useSearchParams } from 'react-router';
import type { Period } from './analysis';

/** Période choisie, gardée dans l'adresse (`?periode=`). */
export function usePeriod(periods: Period[], fallback: Period) {
  const [params, setParams] = useSearchParams();
  const current = periods.find((period) => period === params.get('periode')) ?? fallback;
  const setPeriod = (period: Period) => setParams({ periode: period }, { replace: true });
  return [current, setPeriod] as const;
}
