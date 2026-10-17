/** Lecture à voix haute des réponses de l'assistant (voix du navigateur, gratuite, sur l'appareil). */

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Texte lisible à l'oral : sans mise en forme (gras, titres, puces) ni lien. */
export function speakableText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#`>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.(\s*\.)+/g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Qualité d'une voix française : voix neuronales d'Edge (« Online (Natural) »), puis voix
 * améliorées d'Apple, puis Google, puis les autres ; la France avant les autres pays.
 */
export function voiceScore(voice: Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'localService'>): number {
  const name = voice.name.toLowerCase();
  let score = 0;
  if (/natural|neural/.test(name)) score += 100;
  else if (/premium|enhanced|améliorée|siri/.test(name)) score += 80;
  else if (/google/.test(name)) score += 60;
  else if (!voice.localService) score += 20;
  if (voice.lang.toLowerCase().replace('_', '-') === 'fr-fr') score += 10;
  return score;
}

/** Voix françaises de l'appareil, de la plus naturelle à la moins naturelle. */
export function frenchVoices(): SpeechSynthesisVoice[] {
  if (!speechSupported()) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith('fr'))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

/** Nom court d'une voix : « Microsoft Denise Online (Natural) - French (France) » → « Denise (naturelle) ». */
export function voiceLabel(voice: Pick<SpeechSynthesisVoice, 'name'>): string {
  const natural = /natural|neural/i.test(voice.name);
  const name = voice.name
    .replace(/^(microsoft|apple)\s+/i, '')
    .replace(/\s*online\s*/i, ' ')
    .replace(/\s*\((natural|neural)\)\s*/i, ' ')
    .replace(/\s*-\s*(french|français).*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return natural ? `${name} (naturelle)` : name;
}

/**
 * Chrome et Edge chargent la liste des voix après l'ouverture de la page : sans attendre,
 * la première lecture partirait avec la voix par défaut (souvent robotique).
 */
function voicesReady(waitMs = 1500): Promise<void> {
  const synth = speechSupported() ? window.speechSynthesis : null;
  // Voix déjà là, ou navigateur qui ne prévient pas de leur chargement : lecture tout de suite
  if (!synth || synth.getVoices().length > 0 || typeof synth.addEventListener !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      resolve();
    };
    synth.addEventListener('voiceschanged', done);
    setTimeout(done, waitMs);
  });
}

const VOICE_NAME_KEY = 'rts-assistant-voix-nom';

/** Voix choisie sur cet appareil (vide : la plus naturelle disponible). */
export function chosenVoiceName(): string {
  try {
    return localStorage.getItem(VOICE_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveVoiceName(name: string): void {
  try {
    if (name) localStorage.setItem(VOICE_NAME_KEY, name);
    else localStorage.removeItem(VOICE_NAME_KEY);
  } catch {
    // stockage indisponible (navigation privée) : le choix vaut pour cette visite
  }
}

function frenchVoice(): SpeechSynthesisVoice | undefined {
  const voices = frenchVoices();
  const chosen = chosenVoiceName();
  return voices.find((voice) => voice.name === chosen) ?? voices[0];
}

/** Lecture en cours : une lecture demandée puis coupée avant le chargement des voix ne part pas. */
let reading = 0;

/** Lit le texte ; `onEnd` est appelé à la fin (ou si la lecture est coupée). */
export function speak(text: string, onEnd?: () => void): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const current = ++reading;
  void voicesReady().then(() => {
    if (current !== reading) {
      onEnd?.();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(speakableText(text));
    utterance.lang = 'fr-FR';
    const voice = frenchVoice();
    if (voice) utterance.voice = voice;
    // Les voix neuronales ont déjà un débit naturel ; les autres gagnent à aller un peu plus vite
    utterance.rate = voice && voiceScore(voice) >= 100 ? 1 : 1.05;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    synth.speak(utterance);
  });
}

export function stopSpeaking(): void {
  reading++;
  if (speechSupported()) window.speechSynthesis.cancel();
}

const VOICE_KEY = 'rts-assistant-voix';

/** Préférence « lire les réponses à voix haute » (gardée sur cet appareil, activée par défaut). */
export function voicePreference(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveVoicePreference(on: boolean): void {
  try {
    localStorage.setItem(VOICE_KEY, on ? 'on' : 'off');
  } catch {
    // stockage indisponible (navigation privée) : la préférence vaut pour cette visite
  }
}
