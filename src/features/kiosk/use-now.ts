import { useEffect, useState } from 'react';

/** Heure affichée sur les bornes, mise à jour chaque seconde. */
export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
