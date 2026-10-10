import { describe, expect, it } from 'vitest';
import { kioskPresence } from './domain';

describe('kioskPresence', () => {
  it('borne jamais vue, en ligne, hors ligne', () => {
    expect(kioskPresence(null)).toEqual({ online: false, label: 'Borne jamais connectée' });
    expect(kioskPresence(12)).toEqual({ online: true, label: 'Borne en ligne' });
    expect(kioskPresence(90).online).toBe(true);
    expect(kioskPresence(5 * 60).label).toBe('Borne hors ligne depuis 5 min');
    expect(kioskPresence(2 * 3600 + 120).label).toBe('Borne hors ligne depuis 2 h');
    expect(kioskPresence(3 * 86400).label).toBe('Borne hors ligne depuis 3 j');
  });
});
