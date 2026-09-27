import { useEffect, useState } from 'react';

/**
 * Temps badgé qui défile en direct pendant une session en cours.
 * `workedSeconds` est calculé par la base au moment du chargement (`loadedAt`, en ms) :
 * on n'y ajoute que le temps écoulé depuis ce chargement.
 */
export function useLiveSeconds(workedSeconds: number, runningSince: string | null, loadedAt: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!runningSince) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [runningSince]);

  return workedSeconds + (runningSince ? Math.max(0, (now - loadedAt) / 1000) : 0);
}
