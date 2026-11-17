// =============================================================================
// Edge Function « stt » : dictée Azure de l'Agent Direction sur iPhone.
//
// Sur iPhone, la dictée de Safari ne rend plus le micro après la lecture d'une réponse (voyant
// orange allumé, question suivante jamais entendue). L'appli enregistre donc elle-même la question
// (WAV 16 kHz, micro coupé dès la fin de la phrase) et l'envoie ici ; Azure renvoie le texte et
// les autres versions entendues. Mêmes secrets que la voix : AZURE_SPEECH_KEY et
// AZURE_SPEECH_REGION (ressource Speech au niveau gratuit F0 : au-delà des heures offertes du mois,
// Azure refuse, l'appli propose d'écrire la question).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isExpectedWav, MAX_AUDIO_BYTES, parseRecognition, SAMPLE_RATE, sttUrl } from './stt.ts';

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const key = Deno.env.get('AZURE_SPEECH_KEY');
const region = Deno.env.get('AZURE_SPEECH_REGION') ?? '';
// Adresse de la reconnaissance (remplaçable pour les tests locaux)
const url = Deno.env.get('AZURE_STT_URL') ?? sttUrl(region);

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!key || !url) return fail(503, 'Dictée Azure pas encore configurée : écris ta question');

    const { data: isOffice } = await ctx.supabase.rpc('is_office');
    if (isOffice !== true) return fail(403, 'Dictée de l’Agent Direction réservée au bureau');
    const { data: settings } = await ctx.supabase
      .from('app_settings')
      .select('agent_enabled')
      .maybeSingle();
    if (!settings?.agent_enabled) return fail(409, 'Agent Direction désactivé dans les réglages');

    const length = Number(req.headers.get('content-length') ?? 0);
    if (length > MAX_AUDIO_BYTES) return fail(413, 'Question trop longue : 30 secondes au plus');
    const audio = new Uint8Array(await req.arrayBuffer());
    if (!isExpectedWav(audio)) return fail(400, 'Enregistrement illisible : réessaie');

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': `audio/wav; codecs=audio/pcm; samplerate=${SAMPLE_RATE}`,
          Accept: 'application/json',
          'User-Agent': 'rts-atelier',
        },
        body: audio,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      console.error('Azure dictée injoignable', error);
      return fail(502, 'Dictée indisponible : réessaie ou écris ta question');
    }
    if (response.status === 429 || response.status === 403) {
      console.error('Azure dictée refusée', response.status);
      // Clé refusée ou heures gratuites du mois épuisées (niveau F0)
      return fail(429, 'Dictée Azure refusée (clé ou heures du mois) : écris ta question');
    }
    if (!response.ok) {
      console.error('Azure dictée', response.status);
      return fail(502, 'Dictée indisponible : réessaie ou écris ta question');
    }

    const result = parseRecognition(await response.json().catch(() => null));
    if (result.status === 'error') return fail(502, 'Dictée indisponible : réessaie ou écris ta question');
    if (result.status === 'silence') return json(200, { text: '', alternatives: [] });
    return json(200, { text: result.text, alternatives: result.alternatives });
  }),
};
