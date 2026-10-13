// =============================================================================
// Edge Function « diagnostic » : aide au diagnostic du mécanicien depuis la fiche OR.
//
// Le technicien décrit les symptômes ; la fonction lit, avec ses droits, l'historique du véhicule
// (vehicle_history_for_diagnosis) et les passages utiles de la documentation technique
// (search_knowledge, facultative) et sa fiche de diagnostic (knowledge.ts), puis demande des pistes à
// Claude Sonnet, qui cite ses sources. Chaque
// demande est notée (diagnostic_requests). Clé : secret ANTHROPIC_API_KEY (sans clé : indisponible).
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { diagnosticMessage, type KnowledgePassage, searchQuery, SYSTEM_WITH_SHEET } from './prompt.ts';

z.config(z.locales.fr());

const MODEL = 'claude-sonnet-5-5';
/** Demandes par personne sur 24 h : borne le coût. */
const DAILY_LIMIT = 30;

const requestSchema = z.object({
  repair_order_id: z.guid(),
  question: z.string().trim().min(3).max(2000),
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
const claude = apiKey ? new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 }) : null;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!claude) return fail(503, 'Aide au diagnostic pas encore configurée');
    const userId = ctx.userClaims?.id;
    if (!userId) return fail(401, 'Session expirée : reconnecte-toi');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Décris les symptômes (quelques mots au moins)');
    const { repair_order_id: repairOrderId, question } = parsed.data;

    const admin = ctx.supabaseAdmin;
    const { count } = await admin
      .from('diagnostic_requests')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      return fail(429, `Limite de ${DAILY_LIMIT} demandes par jour atteinte : reprends demain`);
    }

    // Historique lu avec les droits du technicien (OR qui lui est assigné, ou bureau)
    const { data: history, error } = await ctx.supabase.rpc('vehicle_history_for_diagnosis', {
      p_repair_order_id: repairOrderId,
    });
    if (error) return fail(error.code === '42501' ? 403 : 404, error.message);
    const { data: found } = await ctx.supabase.rpc('search_knowledge', {
      p_query: searchQuery(question, history),
      p_limit: 6,
    });
    const passages = ((found ?? []) as KnowledgePassage[]).slice(0, 6);

    let response: Anthropic.Message;
    try {
      response = await claude.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: [{ type: 'text', text: SYSTEM_WITH_SHEET, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: diagnosticMessage(question, history, passages) }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return fail(503, 'Assistant occupé : réessaie dans un instant');
      }
      if (err instanceof Anthropic.APIError) {
        console.error('diagnostic', err.status, err.message);
        return fail(502, 'Aide au diagnostic indisponible pour le moment');
      }
      throw err;
    }
    if (response.stop_reason === 'refusal') {
      return fail(422, 'Demande non traitée : décris les symptômes autrement');
    }
    const answer = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .replaceAll(String.fromCharCode(0x2014), ',')
      .trim();
    if (!answer) return fail(502, 'Pas de réponse : réessaie');

    const sources = passages.map((passage, index) => ({
      n: index + 1,
      title: passage.title,
      page: passage.page,
    }));
    const { error: logError } = await admin.from('diagnostic_requests').insert({
      repair_order_id: repairOrderId,
      profile_id: userId,
      question,
      answer,
      sources,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });
    if (logError) console.error(logError); // réponse obtenue : le journal ne bloque pas
    return json(200, { answer, sources });
  }),
};
