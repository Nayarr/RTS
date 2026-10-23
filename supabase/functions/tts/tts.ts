// Voix Azure de l'Agent Direction : voix proposées, demande de lecture, SSML envoyé à Azure.
import { z } from 'zod';

/** Texte lu en une fois au plus (une réponse de l'agent ou une phrase du point du jour). */
export const MAX_CHARACTERS = 2_000;

/** Voix françaises neuronales proposées dans Réglages › Atelier. */
export const VOICES = [
  'fr-FR-DeniseNeural',
  'fr-FR-HenriNeural',
  'fr-FR-VivienneMultilingualNeural',
  'fr-FR-RemyMultilingualNeural',
  'fr-FR-EloiseNeural',
] as const;

export const requestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_CHARACTERS),
  // Essai d'une autre voix depuis les réglages (sinon la voix réglée)
  voice: z.enum(VOICES).optional(),
});

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export const escapeXml = (text: string) => text.replace(/[&<>"']/g, (char) => XML_ESCAPES[char] ?? char);

/** Corps SSML de la lecture : voix, langue française, texte échappé. */
export function ssml(text: string, voice: string): string {
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">` +
    `<voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;
}

/** Adresse de la synthèse vocale de la région Azure (francecentral, westeurope…). */
export function azureUrl(region: string): string | null {
  return /^[a-z0-9]+$/.test(region)
    ? `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
    : null;
}

/** Format renvoyé : MP3 24 kHz, léger et lu par tous les navigateurs. */
export const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
