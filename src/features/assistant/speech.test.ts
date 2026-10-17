import { describe, expect, it } from 'vitest';
import { saveVoicePreference, speakableText, voiceLabel, voicePreference, voiceScore } from './speech';

describe('lecture à voix haute', () => {
  it('retire la mise en forme et les liens, garde les phrases', () => {
    expect(
      speakableText(
        '**Ce mois-ci** : 12 450 euros.\n\n- Bernard : 1 824 euros\n- [Leroy](/clients/1) : 900 euros',
      ),
    ).toBe('Ce mois-ci : 12 450 euros. Bernard : 1 824 euros. Leroy : 900 euros');
  });

  it('préférence de lecture gardée sur l’appareil (activée par défaut)', () => {
    localStorage.clear();
    expect(voicePreference()).toBe(true);
    saveVoicePreference(false);
    expect(voicePreference()).toBe(false);
    saveVoicePreference(true);
    expect(voicePreference()).toBe(true);
  });

  it('voix les plus naturelles en premier, la France avant les autres pays', () => {
    const voice = (name: string, lang = 'fr-FR', localService = true) => ({ name, lang, localService });
    const ranked = [
      voice('Microsoft Hortense - French (France)'),
      voice('Google français', 'fr-FR', false),
      voice('Microsoft Denise Online (Natural) - French (France)', 'fr-FR', false),
      voice('Microsoft Sylvie Online (Natural) - French (Canada)', 'fr-CA', false),
      voice('Amélie (Premium)', 'fr-CA'),
    ]
      .sort((a, b) => voiceScore(b) - voiceScore(a))
      .map((item) => item.name);
    expect(ranked).toEqual([
      'Microsoft Denise Online (Natural) - French (France)',
      'Microsoft Sylvie Online (Natural) - French (Canada)',
      'Amélie (Premium)',
      'Google français',
      'Microsoft Hortense - French (France)',
    ]);
  });

  it('nom court des voix', () => {
    expect(voiceLabel({ name: 'Microsoft Denise Online (Natural) - French (France)' })).toBe(
      'Denise (naturelle)',
    );
    expect(voiceLabel({ name: 'Google français' })).toBe('Google français');
    expect(voiceLabel({ name: 'Microsoft Hortense - French (France)' })).toBe('Hortense');
  });
});
