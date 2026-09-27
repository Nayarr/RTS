// =============================================================================
// Edge Function « quote-response » : réponse du client à un devis envoyé en ligne.
//
// Appelée depuis la page publique du devis (sans compte, clé publique de l'appli) :
//   - accepter : nom + signature dessinée (PNG), rangée dans R2 puis rattachée au devis ;
//   - refuser  : nom facultatif.
// Le jeton du lien identifie le devis ; les règles (devis envoyé, une seule réponse)
// sont vérifiées en base par public_respond_quote().
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { ObjectStorage, storageConfigFromEnv } from '../_shared/storage.ts';
import { decodeSignature, signatureKey } from './signature.ts';

z.config(z.locales.fr());

const requestSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  accept: z.boolean(),
  signer_name: z.string().trim().max(120).default(''),
  signature: z.string().max(1_500_000).nullish(),
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

function sqlFailure(error: { code?: string; message: string }): Response {
  if (error.code === 'P0002') return fail(404, 'Devis introuvable ou lien expiré');
  if (error.code === 'P0001') return fail(409, error.message);
  if (error.code === '22023') return fail(400, error.message);
  console.error(error);
  return fail(500, 'Erreur inattendue');
}

const storageConfig = storageConfigFromEnv((name) => Deno.env.get(name));
const storage = storageConfig ? new ObjectStorage(storageConfig) : null;

export default {
  fetch: withSupabase({ auth: 'publishable' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Requête invalide');
    const { token, accept, signer_name: signerName, signature } = parsed.data;
    const admin = ctx.supabaseAdmin;

    let file: { id: string; bucket: string; key: string } | null = null;
    if (accept) {
      if (!signerName) return fail(400, 'Indiquez votre nom');
      const bytes = signature ? decodeSignature(signature) : null;
      if (!bytes) return fail(400, 'Signez le devis dans le cadre prévu');
      if (!storage) return fail(503, 'Signature en ligne indisponible : contactez l’atelier');

      const id = crypto.randomUUID();
      const key = signatureKey(new Date(), id);
      await storage.put(storage.bucket, key, bytes, 'image/png');
      const { error } = await admin.from('files').insert({
        id,
        bucket: storage.bucket,
        storage_key: key,
        category: 'signature',
        mime_type: 'image/png',
        size_bytes: bytes.length,
        original_name: 'signature-devis.png',
        uploaded_at: new Date().toISOString(),
      });
      if (error) {
        await storage.delete(storage.bucket, key);
        return sqlFailure(error);
      }
      file = { id, bucket: storage.bucket, key };
    }

    const { data, error } = await admin.rpc('public_respond_quote', {
      p_token: token,
      p_accept: accept,
      p_signer_name: signerName,
      p_signature_file_id: file?.id,
    });
    if (error) {
      // Réponse refusée (déjà répondu, lien invalide…) : la signature n'est pas gardée.
      if (file && storage) {
        await storage.delete(file.bucket, file.key);
        await admin.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', file.id);
      }
      return sqlFailure(error);
    }
    return json(200, data);
  }),
};
