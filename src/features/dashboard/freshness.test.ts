import { describe, expect, it } from 'vitest';
import { freshnessLabel } from './freshness';

describe('fraîcheur des chiffres de l’accueil', () => {
  const at = Date.parse('2026-10-17T12:32:00Z'); // 14:32 à Paris

  it('en ligne : heure du dernier chargement', () => {
    expect(freshnessLabel(at, true)).toBe('À jour à 14:32');
  });

  it('hors connexion : jour et heure des chiffres gardés', () => {
    expect(freshnessLabel(at, false)).toBe('Hors connexion : chiffres du 17/10 à 14:32');
  });
});
