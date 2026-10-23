import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { azureAudio } from './azure-voice';
import type * as AzureVoiceModule from './azure-voice';
import { prefetchSpeech, setVoiceProvider, speak, stopSpeaking } from './speech';

vi.mock('./azure-voice', async (importOriginal) => ({
  ...(await importOriginal<typeof AzureVoiceModule>()),
  azureAudio: vi.fn(),
}));

/** Lecteur audio simulé : lecture réussie ou refusée (lecture automatique bloquée). */
function fakeAudio(play: () => Promise<void>) {
  const played: string[] = [];
  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(public src: string) {}
    play() {
      played.push(this.src);
      return play();
    }
    pause() {}
  }
  vi.stubGlobal('Audio', FakeAudio);
  return played;
}

describe('voix Azure, voix du navigateur en secours', () => {
  const spoken: string[] = [];

  beforeEach(() => {
    spoken.length = 0;
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(public text: string) {}
      },
    );
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: { text: string }) => spoken.push(utterance.text),
        cancel: () => undefined,
        getVoices: () => [{ name: 'Denise', lang: 'fr-FR', localService: false }],
      },
    });
    setVoiceProvider('azure');
  });
  afterEach(() => {
    stopSpeaking();
    setVoiceProvider('browser');
    vi.unstubAllGlobals();
  });

  it('Azure : le texte écrit pour l’oreille est lu par le MP3 d’Azure', async () => {
    vi.mocked(azureAudio).mockResolvedValue('blob:mp3');
    const played = fakeAudio(() => Promise.resolve());
    speak('Facture F11887 : 320,00 €');
    await vi.waitFor(() => expect(played).toEqual(['blob:mp3']));
    expect(azureAudio).toHaveBeenCalledWith('Facture 11887 : 320 euros');
    expect(spoken).toEqual([]);
  });

  it('Azure indisponible (clé, plafond, réseau) : voix du navigateur', async () => {
    vi.mocked(azureAudio).mockRejectedValue(new Error('Plafond du mois atteint'));
    fakeAudio(() => Promise.resolve());
    speak('Bonjour');
    await vi.waitFor(() => expect(spoken).toEqual(['Bonjour']));
  });

  it('lecture automatique bloquée par le navigateur : voix du navigateur', async () => {
    vi.mocked(azureAudio).mockResolvedValue('blob:mp3');
    fakeAudio(() => Promise.reject(new Error('NotAllowedError')));
    speak('Point du jour');
    await vi.waitFor(() => expect(spoken).toEqual(['Point du jour']));
  });

  it('phrase suivante préparée à l’avance, rien demandé avec la voix du navigateur', () => {
    vi.mocked(azureAudio).mockResolvedValue('blob:mp3');
    prefetchSpeech('Deux factures en retard');
    expect(azureAudio).toHaveBeenLastCalledWith('Deux factures en retard');
    vi.mocked(azureAudio).mockClear();
    setVoiceProvider('browser');
    prefetchSpeech('Rien');
    expect(azureAudio).not.toHaveBeenCalled();
  });
});
