// =============================================================================
// Edge Function « label-read » : lecture automatique de l'étiquette du contrôle hayon.
//
// Appelée par la fiche OR du technicien juste après la photo de l'étiquette (réglage
// « Lecture automatique des étiquettes » activé par la direction). La photo est relue
// dans le stockage avec les droits de l'appelant, puis envoyée à l'assistant Claude qui
// renvoie les dates lues (JSON imposé). La fonction calcule la prochaine échéance ;
// le technicien la vérifie avant de l'enregistrer.
// Clé de l'assistant : secret ANTHROPIC_API_KEY du projet (sans clé : lecture indisponible).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { ObjectStorage, storageConfigFromEnv } from '../_shared/storage.ts';
import { nextDueDate, READING_SCHEMA, readingPrompt, validDate } from './reading.ts';

z.config(z.locales.fr());

const requestSchema = z.object({
  file_id: z.guid(),
  kind: z.literal('tailgate'),
});

const readingSchema = z.object({
  last_control_date: z.string(),
  next_due_date: z.string(),
  label_text: z.string().max(500),
  confidence: z.enum(['haute', 'moyenne', 'faible']),
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const storageConfig = storageConfigFromEnv((name) => Deno.env.get(name));
const storage = storageConfig ? new ObjectStorage(storageConfig) : null;
const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const claude = apiKey ? new Anthropic({ apiKey }) : null;

/** Date du jour à Paris (AAAA-MM-JJ), comme l'atelier. */
const parisToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());

/** Base64 d'une image (par blocs : pas de dépassement de pile sur les grosses photos). */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!storage) return fail(503, 'Stockage des fichiers non configuré');
    if (!claude) return fail(503, 'Lecture automatique non configurée : saisis la date à la main');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Requête invalide');

    // Réglage de la direction
    const { data: settings } = await ctx.supabase.from('app_settings').select('label_scan_enabled')
      .maybeSingle();
    if (!settings?.label_scan_enabled) return fail(409, 'Lecture automatique désactivée dans les réglages');

    // Photo lue avec les droits de l'appelant : seules celles qu'il peut voir
    const { data: file, error } = await ctx.supabase
      .from('files')
      .select('bucket, storage_key, mime_type')
      .eq('id', parsed.data.file_id)
      .is('deleted_at', null)
      .not('uploaded_at', 'is', null)
      .maybeSingle();
    if (error || !file) return fail(404, 'Photo introuvable');
    if (!IMAGE_TYPES.includes(file.mime_type as ImageType)) {
      return fail(400, 'Format de photo non pris en charge');
    }
    const bytes = await storage.get(file.bucket, file.storage_key);
    if (!bytes) return fail(404, 'Photo introuvable');

    const today = parisToday();
    let message;
    try {
      message = await claude.beta.messages.create({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        // Refus de l'assistant : nouvelle tentative automatique sur le modèle recommandé
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: READING_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: file.mime_type as ImageType, data: toBase64(bytes) },
              },
              { type: 'text', text: readingPrompt(today) },
            ],
          },
        ],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return fail(503, 'Assistant de lecture occupé : réessaie');
      if (err instanceof Anthropic.APIError) {
        console.error('label-read', err.status, err.message);
        return fail(502, 'Lecture impossible pour le moment : saisis la date à la main');
      }
      throw err;
    }

    if (message.stop_reason === 'refusal' || message.stop_reason === 'max_tokens') {
      return fail(422, 'Étiquette illisible : saisis la date à la main');
    }
    const text = message.content.find((block) => block.type === 'text');
    let reading;
    try {
      reading = readingSchema.parse(JSON.parse(text?.type === 'text' ? text.text : ''));
    } catch {
      return fail(422, 'Étiquette illisible : saisis la date à la main');
    }

    return json(200, {
      next_due_date: nextDueDate(reading, today),
      last_control_date: validDate(reading.last_control_date, today),
      label_text: reading.label_text.trim(),
      confidence: reading.confidence,
    });
  }),
};
