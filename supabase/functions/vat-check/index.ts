// =============================================================================
// Edge Function « vat-check » : vérification du n° de TVA d'un client.
//
// Appelée par le bureau depuis la fiche client. Union européenne : demande au service VIES de la
// Commission européenne (gratuit, sans clé) ; hors Union européenne, aucun service public commun :
// le format est contrôlé (« format »). Avec un client, le résultat est enregistré sur sa fiche
// (seule cette fonction pose l'état de la vérification). VIES injoignable : « unavailable ».
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import {
  formatOk,
  isEuVat,
  normalizeVat,
  registeredName,
  requestSchema,
  type VatResult,
  viesRequest,
  viesSchema,
} from './vat.ts';

z.config(z.locales.fr());

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

// Adresse du service (remplaçable pour les tests locaux)
const VIES_URL = Deno.env.get('VIES_URL') ??
  'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

async function checkVies(vat: string): Promise<VatResult> {
  try {
    const response = await fetch(VIES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(viesRequest(vat)),
      signal: AbortSignal.timeout(10_000),
    });
    const parsed = viesSchema.safeParse(await response.json().catch(() => null));
    if (!response.ok || !parsed.success) {
      console.error('VIES', response.status);
      return { vat_number: vat, status: 'unavailable', name: null };
    }
    return {
      vat_number: vat,
      status: parsed.data.valid ? 'valid' : 'invalid',
      name: parsed.data.valid ? registeredName(parsed.data.name) : null,
    };
  } catch (error) {
    console.error('VIES', error);
    return { vat_number: vat, status: 'unavailable', name: null };
  }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    const { data: isOffice } = await ctx.supabase.rpc('is_office');
    if (isOffice !== true) return fail(403, 'Vérification réservée au bureau');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'N° de TVA attendu (ex. DE123456789)');
    const vat = normalizeVat(parsed.data.vat_number);
    if (!/^[A-Z]{2}/.test(vat)) {
      return fail(400, 'Le n° de TVA commence par le code du pays (ex. DE, BE, CH)');
    }

    const result: VatResult = isEuVat(vat)
      ? formatOk(vat) ? await checkVies(vat) : { vat_number: vat, status: 'invalid', name: null }
      : { vat_number: vat, status: formatOk(vat) ? 'format' : 'invalid', name: null };

    if (parsed.data.client_id) {
      // Fiche lue avec les droits de l'appelant (client existant et visible du bureau)
      const { data: client } = await ctx.supabase
        .from('clients')
        .select('id')
        .eq('id', parsed.data.client_id)
        .maybeSingle();
      if (!client) return fail(404, 'Client introuvable');
      const { error } = await ctx.supabaseAdmin
        .from('clients')
        .update({
          vat_number: result.vat_number,
          vat_status: result.status,
          vat_checked_at: new Date().toISOString(),
          vat_registered_name: result.name,
        })
        .eq('id', client.id);
      if (error) {
        console.error('vat-check enregistrement', error);
        return fail(500, 'Résultat non enregistré');
      }
    }
    return json(200, result);
  }),
};
