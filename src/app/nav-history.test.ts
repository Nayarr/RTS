import { describe, expect, it } from 'vitest';
import { backDelta, nextStack, type NavEntry, type NavStack, type NavType } from './nav-history';

const walk = (steps: [NavType, string, string?][]) =>
  steps.reduce<NavStack>(
    (stack, [type, path, key]) => nextStack(stack, type, { key: key ?? path, path } satisfies NavEntry),
    { entries: [], index: -1 },
  );

describe('nav-history', () => {
  it('revient à la page d’où l’on vient, pas à une page fixe', () => {
    const stack = walk([
      ['POP', '/clients/1'],
      ['PUSH', '/devis/2'],
    ]);
    expect(backDelta(stack)).toBe(-1);
    expect(stack.entries[stack.index + (backDelta(stack) ?? 0)]?.path).toBe('/clients/1');
  });

  it('page ouverte directement : pas de page précédente', () => {
    expect(backDelta(walk([['POP', '/devis/2']]))).toBeNull();
    expect(backDelta({ entries: [], index: -1 })).toBeNull();
  });

  it('ne repasse pas par un formulaire déjà validé', () => {
    const stack = walk([
      ['POP', '/devis'],
      ['PUSH', '/devis/nouveau'],
      ['PUSH', '/devis/3'],
    ]);
    expect(backDelta(stack)).toBe(-2);
  });

  it('modifier puis enregistrer : retour à la page d’avant la fiche', () => {
    const stack = walk([
      ['POP', '/location/flotte'],
      ['PUSH', '/location/flotte/4', 'a'],
      ['PUSH', '/location/flotte/4/modifier'],
      ['PUSH', '/location/flotte/4', 'b'],
    ]);
    expect(backDelta(stack)).toBe(-3);
  });

  it('remplacement et retour du navigateur suivis', () => {
    let stack = walk([
      ['POP', '/or'],
      ['PUSH', '/or/1'],
      ['PUSH', '/devis/2'],
    ]);
    stack = nextStack(stack, 'POP', { key: '/or/1', path: '/or/1' });
    expect(stack.index).toBe(1);
    expect(backDelta(stack)).toBe(-1);
    stack = nextStack(stack, 'REPLACE', { key: 'x', path: '/or/9' });
    expect(stack.entries.map((entry) => entry.path)).toEqual(['/or', '/or/9', '/devis/2']);
  });

  it('même page signalée deux fois : pile inchangée', () => {
    const stack = walk([['POP', '/or']]);
    expect(nextStack(stack, 'POP', { key: '/or', path: '/or' })).toBe(stack);
  });
});
