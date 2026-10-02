import { describe, expect, it } from 'vitest';
import { dictatedText, dictationError } from './use-dictation';

describe('dictée vocale', () => {
  it('texte dicté : majuscule, espaces resserrés, sans point final', () => {
    expect(dictatedText('  remplacement   du filtre à air. ')).toBe('Remplacement du filtre à air');
    expect(dictatedText('éclairage arrière gauche...')).toBe('Éclairage arrière gauche');
    expect(dictatedText('')).toBe('');
  });

  it('messages d’erreur compréhensibles', () => {
    expect(dictationError('not-allowed')).toMatch(/Micro refusé/);
    expect(dictationError('network')).toMatch(/sans réseau/);
    expect(dictationError('no-speech')).toMatch(/Rien entendu/);
    expect(dictationError('autre')).toMatch(/Dictée interrompue/);
  });
});
