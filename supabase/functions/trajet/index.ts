// =============================================================================
// Edge Function « trajet » : distance et temps de trajet aller-retour d'un dépannage extérieur.
//
// Appelée par le bureau à la création (ou sur la fiche) d'un OR « Dépannage extérieur », avec les
// coordonnées de l'atelier et du lieu d'intervention (adresses trouvées par la Géoplateforme de
// l'IGN, dans l'appli). Calcul d'itinéraire TomTom, trafic compris (offre gratuite : 2 500 calculs
// par jour), aller puis retour. Secret : TOMTOM_API_KEY ; sans clé, 503 (saisie à la main).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { requestSchema, roundTrip, routeUrl, tomtomSchema } from './route.ts';

z.config(z.locales.fr());

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const key = Deno.env.get('TOMTOM_API_KEY');
// Adresse du service (remplaçable pour les tests locaux)
const BASE = Deno.env.get('TOMTOM_ROUTING_URL') ?? 'https://api.tomtom.com/routing/1/calculateRoute';

async function leg(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  departAt: string | null,
) {
  const response = await fetch(routeUrl(BASE, key ?? '', from, to, departAt), {
    signal: AbortSignal.timeout(10_000),
  });
  const parsed = tomtomSchema.safeParse(await response.json().catch(() => null));
  if (!response.ok || !parsed.success) {
    console.error('TomTom', response.status);
    return null;
  }
  const { lengthInMeters, travelTimeInSeconds } = parsed.data.routes[0]!.summary;
  return { meters: lengthInMeters, seconds: travelTimeInSeconds };
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!key) return fail(503, 'Calcul du trajet pas encore configuré : saisis la distance et le temps');
    const { data: isOffice } = await ctx.supabase.rpc('is_office');
    if (isOffice !== true) return fail(403, 'Calcul du trajet réservé au bureau');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Lieu d’intervention introuvable sur la carte');
    const { from, to, depart_at: departAt } = parsed.data;

    try {
      const go = await leg(from, to, departAt ?? null);
      if (!go) return fail(502, 'Calcul du trajet indisponible : saisis la distance et le temps');
      // Retour : départ estimé à l'arrivée (trafic de ce moment-là)
      const back = await leg(
        to,
        from,
        departAt ? new Date(new Date(departAt).getTime() + go.seconds * 1000).toISOString() : null,
      );
      if (!back) return fail(502, 'Calcul du trajet indisponible : saisis la distance et le temps');
      return json(200, roundTrip([go, back]));
    } catch (error) {
      console.error('trajet', error);
      return fail(502, 'Calcul du trajet indisponible : saisis la distance et le temps');
    }
  }),
};
