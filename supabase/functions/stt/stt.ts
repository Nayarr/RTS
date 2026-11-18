// Dictée Azure de l'Agent Direction sur iPhone : enregistrement reçu, adresse et lecture du résultat.
import { z } from 'zod';

/** Fréquence de l'enregistrement envoyé par l'appli (WAV PCM 16 bits mono). */
export const SAMPLE_RATE = 16_000;
/** Question de 30 s au plus : 16 000 échantillons de 2 octets par seconde, plus l'en-tête. */
export const MAX_AUDIO_BYTES = SAMPLE_RATE * 2 * 30 + 44;
/** Versions entendues renvoyées en plus de la meilleure (l'agent choisit celle qui a un sens). */
export const MAX_ALTERNATIVES = 3;

/** Adresse de la reconnaissance vocale « audio court » de la région Azure, en français. */
export function sttUrl(region: string): string | null {
  return /^[a-z0-9]+$/.test(region)
    ? `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
      '?language=fr-FR&format=detailed&profanity=raw'
    : null;
}

/** En-tête WAV attendu : RIFF/WAVE, PCM 16 bits, mono, 16 kHz, et au moins un échantillon. */
export function isExpectedWav(bytes: Uint8Array): boolean {
  if (bytes.length <= 44 || bytes.length > MAX_AUDIO_BYTES) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  return (
    tag(0) === 'RIFF' &&
    tag(8) === 'WAVE' &&
    tag(12) === 'fmt ' &&
    view.getUint16(20, true) === 1 && // PCM
    view.getUint16(22, true) === 1 && // mono
    view.getUint32(24, true) === SAMPLE_RATE &&
    view.getUint16(34, true) === 16
  );
}

const azureSchema = z.object({
  RecognitionStatus: z.string(),
  DisplayText: z.string().optional(),
  NBest: z.array(z.object({ Display: z.string() })).optional(),
});

export type Recognition =
  | { status: 'ok'; text: string; alternatives: string[] }
  | { status: 'silence' }
  | { status: 'error' };

/** Rien de compris : silence, bruit ou parole inaudible. */
const SILENCE = new Set(['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout']);

/** Réponse d'Azure lue : texte le plus probable et autres versions, silence, ou erreur. */
export function parseRecognition(value: unknown): Recognition {
  const parsed = azureSchema.safeParse(value);
  if (!parsed.success) return { status: 'error' };
  const { RecognitionStatus: status, DisplayText, NBest = [] } = parsed.data;
  if (SILENCE.has(status)) return { status: 'silence' };
  if (status !== 'Success') return { status: 'error' };
  const versions = NBest.map((item) => item.Display.trim()).filter(Boolean);
  const text = versions[0] ?? DisplayText?.trim() ?? '';
  if (!text) return { status: 'silence' };
  const alternatives = [...new Set(versions.slice(1))].filter((item) => item !== text).slice(
    0,
    MAX_ALTERNATIVES,
  );
  return { status: 'ok', text, alternatives };
}
