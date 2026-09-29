// =============================================================================
// Edge Function « push-send » : envoie les notifications push en attente.
//
// Appelée par la base (pg_net) dès qu'un message est mis en file, et chaque minute en
// secours (tâche planifiée dispatch_push), avec le secret partagé (en-tête x-cron-secret).
// Chaque message est chiffré pour chaque appareil de son destinataire ; les appareils
// désabonnés sont retirés, les messages en échec réessayés (5 fois au plus).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isCronRequest } from '../_shared/cron.ts';
import { createPushServer, pushConfigFromEnv, type PushMessage, sendPush } from '../_shared/push.ts';

interface QueuedPush extends PushMessage {
  id: string;
  subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
}

const MAX_BATCHES = 10;
const json = (status: number, body: unknown) => Response.json(body, { status });

const pushConfig = pushConfigFromEnv((name) => Deno.env.get(name));
const pushServer = pushConfig ? createPushServer(pushConfig) : null;

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
    if (!isCronRequest(req, Deno.env.get('CRON_SECRET'))) return json(401, { error: 'Accès refusé' });
    if (!pushServer) return json(503, { error: 'Notifications push non configurées (clés VAPID)' });

    const server = await pushServer;
    const admin = ctx.supabaseAdmin;
    let sent = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data, error } = await admin.rpc('claim_push_batch', { p_limit: 50 });
      if (error) {
        console.error(error);
        return json(500, { error: 'Erreur inattendue', sent });
      }
      const queue = (data ?? []) as QueuedPush[];
      if (!queue.length) break;

      const delivered: string[] = [];
      const gone: string[] = [];
      const retry: string[] = [];
      await Promise.all(
        queue.map(async (message) => {
          const outcomes = await Promise.all(
            message.subscriptions.map(async (target) => {
              const outcome = await sendPush(server, target, message);
              if (outcome === 'delivered') delivered.push(target.id);
              if (outcome === 'gone') gone.push(target.id);
              return outcome;
            }),
          );
          // Réessayé seulement si aucun appareil ne l'a reçu (pas de doublon sur les autres).
          if (outcomes.includes('retry') && !outcomes.includes('delivered')) retry.push(message.id);
          if (outcomes.includes('delivered')) sent++;
        }),
      );

      const { error: resultError } = await admin.rpc('record_push_results', {
        p_delivered: delivered,
        p_gone: gone,
        p_retry: retry,
      });
      if (resultError) {
        console.error(resultError);
        return json(500, { error: 'Erreur inattendue', sent });
      }
      if (retry.length) break; // service de push en panne : la tâche de secours réessaiera
    }
    return json(200, { sent });
  }),
};
