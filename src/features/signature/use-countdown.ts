import { useEffect, useState } from 'react';
import { secondsLeft } from './domain';

/**
 * Compte à rebours d'une demande sur la borne. `serverSeconds` vient de la base au moment de la
 * lecture (`readAt`, en ms) : seul le temps écoulé depuis est retiré (pas d'écart d'horloge).
 */
export function useCountdown(serverSeconds: number, readAt: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);

  return active ? secondsLeft(serverSeconds, readAt, now) : 0;
}
