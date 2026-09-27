import { useSyncExternalStore } from 'react';

/** Vrai si la media query correspond (ex. « (min-width: 768px) »), mis à jour au redimensionnement. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** Écran d'ordinateur ou de tablette en paysage (tableaux plutôt que cartes). */
export const useIsDesktop = () => useMediaQuery('(min-width: 768px)');
