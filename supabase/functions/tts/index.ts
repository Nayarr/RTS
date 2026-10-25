// =============================================================================
// Edge Function « tts » : voix naturelle d'Azure pour l'Agent Direction.
//
// Appelée par l'appli (direction connectée, Agent Direction activé, voix Azure choisie dans
// Réglages › Atelier) avec le texte à lire ; renvoie le MP3 lu par Azure. Secrets :
// AZURE_SPEECH_KEY et AZURE_SPEECH_REGION (ressource Speech au niveau gratuit F0). Chaque lecture
// réserve ses caractères dans le compteur du mois (tts_usage) : au-delà du plafond réglé, réponse
// 429 et l'appli lit avec la voix du navigateur. Sans clé : 503, même secours.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { azureUrl, OUTPUT_FORMAT, requestSchema, ssml } from './tts.ts';

z.config(z.locales.fr());

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const key = Deno.env.get('AZURE_SPEECH_KEY');
const region = Deno.env.get('AZURE_SPEECH_REGION') ?? '';
// Adresse de la synthèse (remplaçable pour les tests locaux)
const url = Deno.env.get('AZURE_SPEECH_URL') ?? azureUrl(region);

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!key || !url) return fail(503, 'Voix Azure pas encore configurée');

    const { data: isDirection } = await ctx.supabase.rpc('is_direction');
    if (isDirection !== true) return fail(403, 'Voix de l’Agent Direction réservée à la direction');
    const { data: settings } = await ctx.supabase
      .from('app_settings')
      .select('agent_enabled, tts_provider, tts_voice')
      .maybeSingle();
    if (!settings?.agent_enabled) return fail(409, 'Agent Direction désactivé dans les réglages');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Texte à lire invalide');
    const { text } = parsed.data;
    // Essai d'une voix depuis les réglages : permis même si la voix du navigateur est choisie
    if (!parsed.data.voice && settings.tts_provider !== 'azure') {
      return fail(409, 'Voix du navigateur choisie dans les réglages');
    }
    const voice = parsed.data.voice ?? String(settings.tts_voice);

    const admin = ctx.supabaseAdmin;
    const { data: total, error: reserveError } = await admin.rpc('tts_reserve', {
      p_characters: text.length,
    });
    if (reserveError) {
      console.error('tts compteur', reserveError);
      return fail(500, 'Compteur de la voix indisponible');
    }
    if (total === null) {
      return fail(429, 'Plafond du mois atteint : voix du navigateur jusqu’au mois prochain');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
        'User-Agent': 'rts-atelier',
      },
      body: ssml(text, voice),
    });
    if (!response.ok) {
      console.error('Azure synthèse', response.status);
      // Lecture refusée : les caractères ne comptent pas
      await admin.rpc('tts_release', { p_characters: text.length });
      return fail(502, 'Voix Azure indisponible : voix du navigateur');
    }
    return new Response(response.body, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' },
    });
  }),
};
