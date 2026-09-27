// =============================================================================
// Edge Function « files » : fichiers stockés dans Cloudflare R2.
//
//   - upload   : réserve le fichier (droits de l'appelant, règles en base) et renvoie
//                une URL signée pour l'envoyer directement dans R2 (10 min, type imposé) ;
//   - confirm  : vérifie que l'objet est bien arrivé (taille, type) et confirme l'envoi ;
//   - download : URL signées de lecture (1 h) pour les fichiers que l'appelant a le droit
//                de voir (RLS de la table files).
// Les fichiers ne transitent jamais par la fonction : le navigateur parle directement à R2.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { contentDisposition, ObjectStorage, storageConfigFromEnv } from '../_shared/storage.ts';

z.config(z.locales.fr()); // messages de validation en français

const CATEGORIES = [
  'ro_photo',
  'signature',
  'registration_doc',
  'clock_photo',
  'document_pdf',
  'label_scan',
  'logo',
  'other',
] as const;
const UPLOAD_TTL = 10 * 60;
const DOWNLOAD_TTL = 60 * 60;

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('upload'),
    category: z.enum(CATEGORIES),
    mime_type: z.string().min(1).max(100),
    size_bytes: z.int().positive(),
    original_name: z.string().max(200).nullish(),
  }),
  z.object({
    action: z.literal('confirm'),
    file_id: z.guid(),
  }),
  z.object({
    action: z.literal('download'),
    file_ids: z.array(z.guid()).min(1).max(100),
    disposition: z.enum(['inline', 'attachment']).optional(),
  }),
]);

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

/** Erreur SQL levée par les règles en base → réponse HTTP (message en français conservé). */
function sqlFailure(error: { code?: string; message: string }): Response {
  if (error.code === '42501') return fail(403, error.message);
  if (error.code === '22023') return fail(400, error.message);
  if (error.code === 'P0002') return fail(404, error.message);
  console.error(error);
  return fail(500, 'Erreur inattendue');
}

const storageConfig = storageConfigFromEnv((name) => Deno.env.get(name));
const storage = storageConfig ? new ObjectStorage(storageConfig) : null;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!storage) return fail(503, 'Stockage des fichiers non configuré');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json(400, { error: 'Requête invalide', details: parsed.error.issues.map((i) => i.message) });
    }
    const request = parsed.data;

    // ------------------------------------------------------------------ upload
    if (request.action === 'upload') {
      const { data, error } = await ctx.supabase
        .rpc('register_file', {
          p_category: request.category,
          p_mime_type: request.mime_type,
          p_size_bytes: request.size_bytes,
          p_bucket: storage.bucket,
          p_original_name: request.original_name ?? null,
        })
        .single<{ file_id: string; storage_key: string }>();
      if (error) return sqlFailure(error);

      const headers = { 'Content-Type': request.mime_type };
      const uploadUrl = await storage.presign('PUT', storage.bucket, data.storage_key, UPLOAD_TTL, {
        headers,
      });
      return json(201, {
        file_id: data.file_id,
        upload_url: uploadUrl,
        method: 'PUT',
        headers,
        expires_in: UPLOAD_TTL,
      });
    }

    // ----------------------------------------------------------------- confirm
    if (request.action === 'confirm') {
      const userId = ctx.userClaims?.id;
      const admin = ctx.supabaseAdmin;
      const { data: file, error } = await admin
        .from('files')
        .select('id, bucket, storage_key, uploaded_by, uploaded_at, deleted_at, size_bytes')
        .eq('id', request.file_id)
        .maybeSingle();
      if (error) return sqlFailure(error);
      if (!file || file.uploaded_by !== userId || file.deleted_at) return fail(404, 'Envoi introuvable');
      if (file.uploaded_at) return json(200, { file_id: file.id, size_bytes: file.size_bytes });

      const stored = await storage.head(file.bucket, file.storage_key);
      if (!stored) return fail(409, 'Fichier non reçu : relance l’envoi');

      const { error: confirmError } = await admin.rpc('confirm_file_upload', {
        p_file_id: file.id,
        p_user_id: userId,
        p_size_bytes: stored.size,
        p_mime_type: stored.contentType,
      });
      if (confirmError) {
        // Objet refusé (trop gros, mauvais type) : on ne le garde pas.
        if (confirmError.code === '22023') {
          await storage.delete(file.bucket, file.storage_key);
          await admin.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', file.id);
        }
        return sqlFailure(confirmError);
      }
      return json(200, { file_id: file.id, size_bytes: stored.size });
    }

    // ---------------------------------------------------------------- download
    // Lecture avec les droits de l'appelant : les fichiers qu'il ne peut pas voir sont absents.
    const { data: files, error } = await ctx.supabase
      .from('files')
      .select('id, bucket, storage_key, original_name')
      .in('id', request.file_ids)
      .is('deleted_at', null)
      .not('uploaded_at', 'is', null);
    if (error) return sqlFailure(error);

    const entries = await Promise.all(
      files.map(async (file) => {
        const query = {
          'response-content-disposition': contentDisposition(file.original_name, request.disposition),
        };
        const url = await storage.presign('GET', file.bucket, file.storage_key, DOWNLOAD_TTL, { query });
        return [file.id, url] as const;
      }),
    );
    return json(200, { urls: Object.fromEntries(entries), expires_in: DOWNLOAD_TTL });
  }),
};
