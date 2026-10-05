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

/** Voix française du navigateur, de préférence une voix « naturelle » quand il en propose une. */
function frenchVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLowerCase().startsWith('fr'));
  return (
    voices.find((voice) => /natural|neural|premium|enhanced|google/i.test(voice.name)) ??
    voices.find((voice) => voice.lang.toLowerCase() === 'fr-fr') ??
    voices[0]
  );
}

/** Lit le texte ; `onEnd` est appelé à la fin (ou si la lecture est coupée). */
export function speak(text: string, onEnd?: () => void): void {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(speakableText(text));
  utterance.lang = 'fr-FR';
  const voice = frenchVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 1.05;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
}

export function stopSpeaking(): void {
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
