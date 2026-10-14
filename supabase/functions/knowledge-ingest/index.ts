// =============================================================================
// Edge Function « knowledge-ingest » : ajoute un PDF à la documentation technique.
//
// Appelée par la direction juste après l'envoi du PDF (page Documentation technique). Le fichier
// est relu dans le stockage avec les droits de l'appelant, son texte est extrait page par page
// (pdf.js), découpé en passages puis rangé dans knowledge_chunks, où l'aide au diagnostic les
// cherche. Un PDF scanné sans texte est signalé (à faire passer dans un logiciel de reconnaissance).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';
import { ObjectStorage, storageConfigFromEnv } from '../_shared/storage.ts';
import { chunkPages, MAX_CHUNKS } from './chunks.ts';

z.config(z.locales.fr());

const requestSchema = z.object({ document_id: z.guid() });
const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const storageConfig = storageConfigFromEnv((name) => Deno.env.get(name));
const storage = storageConfig ? new ObjectStorage(storageConfig) : null;
/** 20 Mo (limite de l'envoi des PDF) : au-delà, le manuel est à couper en plusieurs PDF. */
const MAX_BYTES = 20 * 1024 * 1024;

/** Texte de chaque page du PDF. */
async function pdfPages(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const pages: string[] = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? `${item.str}${item.hasEOL ? '\n' : ' '}` : ''))
        .join(''),
    );
  }
  return pages;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!storage) return fail(503, 'Stockage des fichiers non configuré');
    const { data: isDirection } = await ctx.supabase.rpc('is_direction');
    if (isDirection !== true) return fail(403, 'Documentation gérée par la direction');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Requête invalide');
    const { data: document } = await ctx.supabase
      .from('knowledge_documents')
      .select('id, file_id, status')
      .eq('id', parsed.data.document_id)
      .maybeSingle();
    if (!document?.file_id) return fail(404, 'Document introuvable');

    // PDF relu avec les droits de l'appelant
    const { data: file } = await ctx.supabase
      .from('files')
      .select('bucket, storage_key, mime_type, size_bytes')
      .eq('id', document.file_id)
      .is('deleted_at', null)
      .not('uploaded_at', 'is', null)
      .maybeSingle();
    if (!file) return fail(404, 'PDF introuvable');
    if (file.mime_type !== 'application/pdf') return fail(400, 'Le document doit être un PDF');
    if ((file.size_bytes ?? 0) > MAX_BYTES) {
      return fail(413, 'PDF trop lourd (20 Mo au plus) : coupe-le en plusieurs');
    }

    const admin = ctx.supabaseAdmin;
    const finish = (patch: Record<string, unknown>) =>
      admin.from('knowledge_documents').update(patch).eq('id', document.id);

    let pages: string[];
    try {
      const bytes = await storage.get(file.bucket, file.storage_key);
      if (!bytes) return fail(404, 'PDF introuvable');
      pages = await pdfPages(bytes);
    } catch (error) {
      console.error('knowledge-ingest', error);
      await finish({ status: 'failed', error: 'PDF illisible' });
      return fail(422, 'PDF illisible');
    }

    const chunks = chunkPages(pages);
    if (chunks.length === 0) {
      await finish({
        status: 'failed',
        pages: pages.length,
        error: 'Aucun texte : PDF scanné à passer en reconnaissance de texte',
      });
      return fail(422, 'Ce PDF ne contient pas de texte (document scanné)');
    }

    await admin.from('knowledge_chunks').delete().eq('document_id', document.id);
    for (let start = 0; start < chunks.length; start += 500) {
      const { error } = await admin
        .from('knowledge_chunks')
        .insert(chunks.slice(start, start + 500).map((chunk) => ({ ...chunk, document_id: document.id })));
      if (error) {
        console.error(error);
        await finish({ status: 'failed', error: 'Passages non enregistrés' });
        return fail(500, 'Erreur inattendue');
      }
    }
    await finish({
      status: 'ready',
      pages: pages.length,
      chunks: chunks.length,
      error: chunks.length >= MAX_CHUNKS ? `Document coupé à ${MAX_CHUNKS} passages` : null,
    });
    return json(200, { pages: pages.length, chunks: chunks.length });
  }),
};
