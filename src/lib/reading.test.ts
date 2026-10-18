import { describe, expect, it } from 'vitest';
import { READING_FAILED, readingFailedMessage } from './reading';

describe('lecture impossible', () => {
  it('message unique, avec la cause en plus', () => {
    expect(readingFailedMessage(null)).toBe(READING_FAILED);
    expect(readingFailedMessage(new Error('Réseau indisponible'))).toBe(
      'Lecture impossible : renseigne les informations à la main. (Réseau indisponible)',
    );
    expect(readingFailedMessage(new Error('Lecture impossible : photo floue'))).toBe(READING_FAILED);
  });
});
