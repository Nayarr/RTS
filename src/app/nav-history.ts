import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * Pages ouvertes dans l'onglet, pour que le bouton retour ramène à la page d'où l'on vient (et non à
 * une page fixe). Gardées pour l'onglet : un rechargement ne perd pas le chemin parcouru.
 */
export interface NavEntry {
  key: string;
  path: string;
}
export interface NavStack {
  entries: NavEntry[];
  index: number;
}
export type NavType = 'PUSH' | 'REPLACE' | 'POP';

const STORAGE_KEY = 'rts.nav-history';
const MAX_ENTRIES = 200;

/** Formulaires et étapes déjà validés : le retour ne repasse pas par ces pages. */
const FORM_PAGE = /\/(nouveau|nouvelle|modifier|depart|retour)$/;

export function nextStack(stack: NavStack, type: NavType, entry: NavEntry): NavStack {
  const current = stack.entries[stack.index];
  if (current?.key === entry.key && current.path === entry.path) return stack;
  if (type === 'POP') {
    const index = stack.entries.findIndex((item) => item.key === entry.key);
    // Page inconnue (premier affichage de l'onglet) : le chemin repart d'ici
    return index >= 0 ? { ...stack, index } : { entries: [entry], index: 0 };
  }
  if (type === 'REPLACE' && current) {
    return { ...stack, entries: stack.entries.map((item, i) => (i === stack.index ? entry : item)) };
  }
  const entries = [...stack.entries.slice(0, stack.index + 1), entry].slice(-MAX_ENTRIES);
  return { entries, index: entries.length - 1 };
}

/** Pas à reculer jusqu'à la page précédente réelle (autre adresse, pas un formulaire) ; null : aucune. */
export function backDelta({ entries, index }: NavStack): number | null {
  const current = entries[index];
  if (!current) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const path = entries[i]?.path ?? '';
    if (path !== current.path && !FORM_PAGE.test(path)) return i - index;
  }
  return null;
}

function loadStack(): NavStack {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved) as NavStack;
  } catch {
    // Stockage indisponible ou illisible : le chemin repart de zéro.
  }
  return { entries: [], index: -1 };
}

let stack = loadStack();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Suit les changements de page : à placer une fois, dans la coquille de l'appli. */
export function useNavHistoryTracker() {
  const { key, pathname } = useLocation();
  const type = useNavigationType();
  useLayoutEffect(() => {
    const next = nextStack(stack, type, { key, path: pathname });
    if (next === stack) return;
    stack = next;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
    } catch {
      // Stockage indisponible : le chemin reste valable jusqu'au rechargement.
    }
    listeners.forEach((listener) => listener());
  }, [key, pathname, type]);
}

/** Pas à reculer pour revenir à la page précédente, null si l'on est arrivé directement ici. */
export function useBackDelta() {
  return useSyncExternalStore(subscribe, () => backDelta(stack));
}
