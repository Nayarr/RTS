// =============================================================================
// Edge Function « ro-signature » : signature d'un OR par le client absent (lien e-mail).
//
// Appelée depuis la page publique de la demande de signature (sans compte, clé publique
// de l'appli) : nom + signature dessinée (PNG), rangée dans R2 puis rattachée à l'OR.
// Le jeton du lien identifie la demande ; les règles (lien valable, une seule signature)
// sont vérifiées en base par public_sign_repair_order().
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { decodeSignature, signatureKey } from '../_shared/signature.ts';
import { ObjectStorage, storageConfigFromEnv } from '../_shared/storage.ts';

z.config(z.locales.fr());

const requestSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/),
  signer_name: z.string().trim().max(120),
  signature: z.string().max(1_500_000),
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

function sqlFailure(error: { code?: string; message: string }): Response {
  if (error.code === 'P0002') return fail(404, 'Lien de signature inconnu');
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
    const { token, signer_name: signerName, signature } = parsed.data;
    if (!signerName) return fail(400, 'Indiquez votre nom');
    const bytes = decodeSignature(signature);
    if (!bytes) return fail(400, 'Signez dans le cadre prévu');
    if (!storage) return fail(503, 'Signature en ligne indisponible : contactez l’atelier');
    const admin = ctx.supabaseAdmin;

    const id = crypto.randomUUID();
    const key = signatureKey(new Date(), id);
    await storage.put(storage.bucket, key, bytes, 'image/png');
    const { error: fileError } = await admin.from('files').insert({
      id,
      bucket: storage.bucket,
      storage_key: key,
      category: 'signature',
      mime_type: 'image/png',
      size_bytes: bytes.length,
      original_name: 'signature-or.png',
      uploaded_at: new Date().toISOString(),
    });
    if (fileError) {
      await storage.delete(storage.bucket, key);
      return sqlFailure(fileError);
    }

    const { data, error } = await admin.rpc('public_sign_repair_order', {
      p_token: token,
      p_signer_name: signerName,
      p_signature_file_id: id,
    });
    if (error) {
      // Signature refusée (déjà signé, lien expiré…) : l'image n'est pas gardée.
      await storage.delete(storage.bucket, key);
      await admin.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      return sqlFailure(error);
    }
    return json(200, data);
  }),
};
