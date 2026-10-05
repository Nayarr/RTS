import { describe, expect, it } from 'vitest';
import { saveVoicePreference, speakableText, voicePreference } from './speech';

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
});
