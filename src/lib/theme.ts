import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'rts-theme';
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

let current: Theme = typeof window === 'undefined' ? 'light' : readTheme();

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141517' : '#137017');
}

/** Thème choisi sur cet appareil (clair par défaut), appliqué avant le premier affichage. */
export function initTheme() {
  apply(current);
}

let fadeTimer: ReturnType<typeof setTimeout> | undefined;

/** Fondu des couleurs le temps de la bascule (sauf si l'appareil demande moins d'animations). */
function fadeColors() {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduce) return;
  const root = document.documentElement;
  root.classList.add('theme-anim');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove('theme-anim'), 400);
}

export function setTheme(theme: Theme) {
  if (theme !== current) fadeColors();
  current = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Navigation privée : le choix vaut pour la session seulement.
  }
  apply(theme);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 'light',
  );
}
