// Voix Azure de l'Agent Direction : MP3 lu par l'Edge Function « tts », gardé le temps de la visite
// (relire une réponse ou le point du jour ne consomme rien de plus).
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** Voix françaises proposées (mêmes que la fonction « tts »). */
export const AZURE_VOICES = [
  { value: 'fr-FR-DeniseNeural', label: 'Denise (femme, posée)' },
  { value: 'fr-FR-HenriNeural', label: 'Henri (homme)' },
  { value: 'fr-FR-VivienneMultilingualNeural', label: 'Vivienne (femme, expressive)' },
  { value: 'fr-FR-RemyMultilingualNeural', label: 'Rémy (homme, expressif)' },
  { value: 'fr-FR-EloiseNeural', label: 'Éloïse (femme, jeune)' },
] as const;
export type AzureVoice = (typeof AZURE_VOICES)[number]['value'];

/** Raison pour laquelle Azure n'a pas lu (la voix du navigateur prend le relais). */
export class AzureVoiceError extends Error {}

const cache = new Map<string, Promise<string>>();

async function download(text: string, voice?: AzureVoice): Promise<string> {
  const response = await supabase.functions.invoke<Blob>('tts', {
    body: voice ? { text, voice } : { text },
  });
  const data: unknown = response.data;
  const error: unknown = response.error;
  if (error || !(data instanceof Blob) || data.size === 0) {
    const payload =
      error instanceof FunctionsHttpError
        ? ((await (error.context as Response).json().catch(() => null)) as { error?: string } | null)
        : null;
    throw new AzureVoiceError(payload?.error ?? 'Voix Azure indisponible');
  }
  return URL.createObjectURL(new Blob([data], { type: 'audio/mpeg' }));
}

/** Adresse locale du MP3 de ce texte (téléchargé une seule fois par visite). */
export function azureAudio(text: string, voice?: AzureVoice): Promise<string> {
  const key = `${voice ?? ''}|${text}`;
  let audio = cache.get(key);
  if (!audio) {
    audio = download(text, voice);
    // Échec : pas gardé, un nouvel essai pourra réussir
    audio.catch(() => cache.delete(key));
    cache.set(key, audio);
  }
  return audio;
}
