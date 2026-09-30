// =============================================================================
// Edge Function « files-purge » : efface de R2 les fichiers marqués supprimés.
//
// Appelée chaque nuit par la tâche planifiée purge_files() (pg_cron → pg_net) avec le
// secret partagé (en-tête x-cron-secret). Photos de pointage expirées, envois jamais
// confirmés, fichiers remplacés ou orphelins : l'objet R2 est effacé, la ligne de la
// table files est conservée avec sa date de purge.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isCronRequest } from '../_shared/cron.ts';
import { ObjectStorage, storageConfigFromEnv } from '../_shared/storage.ts';

const BATCH = 100;
const MAX_BATCHES = 20; // 2 000 fichiers par passage au plus ; le reste la nuit suivante

interface PurgeTarget {
  id: string;
  bucket: string;
  storage_key: string;
}

const json = (status: number, body: unknown) => Response.json(body, { status });

const storageConfig = storageConfigFromEnv((name) => Deno.env.get(name));
const storage = storageConfig ? new ObjectStorage(storageConfig) : null;

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
    if (!isCronRequest(req, Deno.env.get('CRON_SECRET'))) return json(401, { error: 'Accès refusé' });
    if (!storage) return json(503, { error: 'Stockage des fichiers non configuré' });

    const admin = ctx.supabaseAdmin;
    let purged = 0;
    let failed = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data, error } = await admin.rpc('files_to_purge', { p_limit: BATCH });
      if (error) {
        console.error(error);
        return json(500, { error: 'Erreur inattendue', purged, failed });
      }
      const files = (data ?? []) as PurgeTarget[];
      if (!files.length) break;

      const results = await Promise.allSettled(
        files.map((file) => storage.delete(file.bucket, file.storage_key).then(() => file.id)),
      );
      const done = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
      failed += results.length - done.length;
      for (const result of results) if (result.status === 'rejected') console.error(result.reason);

      if (done.length) {
        const { error: markError } = await admin.rpc('mark_files_purged', { p_ids: done });
        if (markError) {
          console.error(markError);
          return json(500, { error: 'Erreur inattendue', purged, failed });
        }
        purged += done.length;
      }
      // Objets impossibles à effacer (R2 indisponible…) : on réessaiera la nuit suivante.
      if (done.length < files.length) break;
    }
    return json(200, { purged, failed });
  }),
};
