// =============================================================================
// Edge Function « agent » : assistant de la direction (questions à la voix ou à l'écrit).
//
// La page « Assistant » envoie la question ; l'assistant Claude (Sonnet) choisit les outils de
// lecture utiles (tools.ts), qui interrogent la base avec les droits de la personne connectée,
// puis répond. Il peut aussi préparer des actions (actions.ts : rendez-vous, travaux et dates des
// OR, échéances, brouillon de facture, mails un par un), notées « proposées » et renvoyées à la
// page : rien ne s'exécute avant la validation de la direction. Il peut montrer une liste en
// tableau (display.ts), gardé avec la réponse. Hormis ces propositions, seul l'historique de la
// conversation est écrit.
// Direction et réception (bureau), réglage « Assistant de la direction » activé, limite de questions
// par jour. Réception : lectures de ce qu'elle voit dans l'appli, seule écriture la préparation de
// mails. Clé : secret ANTHROPIC_AGENT_API_KEY (sans clé : assistant indisponible).
//
// Avec { briefing: true } : point du jour (briefing.ts), fait une fois par jour et gardé ;
// { briefing: true, refresh: true } le refait avec les données du moment.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from '@anthropic-ai/sdk';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import {
  answerText,
  conversationTitle,
  parisToday,
  questionText,
  RECEPTION_NOTE,
  SYSTEM_PROMPT,
  workshopContext,
} from './prompt.ts';
import { runTool, TOOL_DEFINITIONS } from './tools.ts';
import { toolAllowed } from './access.ts';
import { ACTION_DEFINITIONS, isActionTool, type ProposedAction, runAction } from './actions.ts';
import { type AgentTable, DISPLAY_DEFINITIONS, isDisplayTool, runDisplay } from './display.ts';
import {
  BRIEFING_JSON_SCHEMA,
  briefingRequest,
  briefingText,
  gatherBriefing,
  parseBriefing,
} from './briefing.ts';

z.config(z.locales.fr());

const MODEL = 'claude-sonnet-5-5';
/** Questions par personne sur 24 h : bien au-dessus d'un usage normal, borne le coût en cas d'abus. */
const DAILY_LIMIT = 60;
/** Au-delà, la conversation devient longue (et chère à relire) : on en commence une nouvelle. */
const MAX_TURNS_PER_CONVERSATION = 30;
/** Allers-retours avec les outils pour une seule question. */
const MAX_STEPS = 8;

/** Points du jour faits par personne et par jour (le premier plus les actualisations). */
const BRIEFINGS_PER_DAY = 6;

const briefingSchema = z.object({ briefing: z.literal(true), refresh: z.boolean().default(false) });
const requestSchema = z.object({
  conversation_id: z.guid().optional(),
  question: z.string().trim().min(1).max(2000),
  spoken: z.boolean().default(false),
  // Autres versions entendues par la dictée du navigateur (la première est la question)
  alternatives: z.array(z.string().trim().max(2000)).max(3).default([]),
});

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const apiKey = Deno.env.get('ANTHROPIC_AGENT_API_KEY');
// Adresse de l'API (remplaçable pour les tests locaux)
const baseURL = Deno.env.get('ANTHROPIC_AGENT_API_URL');
const claude = apiKey
  ? new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}), maxRetries: 2, timeout: 60_000 })
  : null;

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!claude) return fail(503, 'Assistant pas encore configuré');

    const { data: isOffice } = await ctx.supabase.rpc('is_office');
    if (isOffice !== true) return fail(403, 'Assistant réservé au bureau');
    const { data: isDirection } = await ctx.supabase.rpc('is_direction');
    const direction = isDirection === true;
    // Réception : lecture seule (hors pilotage, équipe, stock, réglages, mails reçus), mails seulement
    const allowed = (name: string) => toolAllowed(name, direction);
    const tools = [...TOOL_DEFINITIONS, ...ACTION_DEFINITIONS, ...DISPLAY_DEFINITIONS].filter((item) =>
      allowed(item.name)
    );
    const { data: settings } = await ctx.supabase
      .from('app_settings')
      .select('agent_enabled, agent_memo')
      .maybeSingle();
    if (!settings?.agent_enabled) return fail(409, 'Assistant désactivé dans les réglages');

    const body: unknown = await req.json().catch(() => null);
    const userId = ctx.userClaims?.id;
    if (!userId) return fail(401, 'Session expirée : reconnecte-toi');
    const admin = ctx.supabaseAdmin;

    // Contexte de l'atelier : techniciens actifs (aide à reconnaître les prénoms) et mémo de la direction
    const loadContext = async () => {
      const { data: team } = await ctx.supabase
        .from('technicians')
        .select('display_name')
        .eq('is_active', true)
        .order('sort_order');
      const workshop = workshopContext({
        technicians: (team ?? []).map((member) => String(member.display_name)),
        memo: String(settings?.agent_memo ?? ''),
      });
      return direction ? workshop : `${workshop}\n\n${RECEPTION_NOTE}`;
    };

    const briefingAsked = briefingSchema.safeParse(body);
    if (briefingAsked.success) {
      const today = parisToday();
      const { data: existing } = await admin
        .from('agent_briefings')
        .select('id, day, text, phrases, tools, generations, updated_at')
        .eq('profile_id', userId)
        .eq('day', today)
        .maybeSingle();
      if (existing && !briefingAsked.data.refresh) return json(200, { briefing: briefingView(existing) });
      if (existing && existing.generations >= BRIEFINGS_PER_DAY) {
        return fail(
          429,
          `Point du jour déjà refait ${BRIEFINGS_PER_DAY} fois aujourd’hui : pose plutôt une question`,
        );
      }

      const [sections, context] = await Promise.all([
        gatherBriefing(ctx.supabase, today, allowed),
        loadContext(),
      ]);
      let response: Anthropic.Message;
      try {
        response = await claude.messages.create({
          model: MODEL,
          max_tokens: 1500,
          system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: context },
          ],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: BRIEFING_JSON_SCHEMA } },
          messages: [{ role: 'user', content: briefingRequest(today, sections) }],
        });
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
          return fail(503, 'Assistant occupé : réessaie dans un instant');
        }
        if (err instanceof Anthropic.APIError) {
          console.error('agent briefing', err.status, err.message);
          return fail(502, 'Point du jour indisponible pour le moment : réessaie dans un instant');
        }
        throw err;
      }
      const phrases = response.stop_reason === 'end_turn'
        ? parseBriefing(answerText(response.content))
        : null;
      if (!phrases) return fail(502, 'Point du jour pas rédigé : réessaie dans un instant');
      const text = briefingText(phrases);

      const row = {
        profile_id: userId,
        day: today,
        text: text.slice(0, 3000),
        phrases,
        tools: sections.map((section) => section.tool),
        generations: (existing?.generations ?? 0) + 1,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
        updated_at: new Date().toISOString(),
      };
      const { data: saved, error } = await admin
        .from('agent_briefings')
        .upsert(row, { onConflict: 'profile_id,day' })
        .select('id, day, text, phrases, tools, generations, updated_at')
        .single();
      if (error || !saved) console.error(error); // point obtenu : l'enregistrement ne bloque pas
      return json(200, { briefing: briefingView(saved ?? { ...row, id: null }) });
    }

    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'Question vide ou trop longue');
    const { conversation_id: conversationId, question, spoken, alternatives } = parsed.data;

    const { count: today } = await admin
      .from('agent_turns')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', userId)
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    if ((today ?? 0) >= DAILY_LIMIT) {
      return fail(429, `Limite de ${DAILY_LIMIT} questions par jour atteinte : reprends demain`);
    }

    let transcript: Anthropic.MessageParam[] = [];
    if (conversationId) {
      const { data: conversation } = await admin
        .from('agent_conversations')
        .select('profile_id, transcript')
        .eq('id', conversationId)
        .maybeSingle();
      if (!conversation || conversation.profile_id !== userId) return fail(404, 'Conversation introuvable');
      const { count: turns } = await admin
        .from('agent_turns')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId);
      if ((turns ?? 0) >= MAX_TURNS_PER_CONVERSATION) {
        return fail(409, 'Conversation trop longue : commence une nouvelle conversation');
      }
      transcript = conversation.transcript as Anthropic.MessageParam[];
    }

    // Échanges de cette question, ajoutés à la suite sans jamais réécrire les précédents
    const messages: Anthropic.MessageParam[] = [
      ...transcript,
      { role: 'user', content: questionText(question, spoken, parisToday(), alternatives) },
    ];
    const context = await loadContext();
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const used = new Set<string>();
    const proposed: ProposedAction[] = [];
    const tables: AgentTable[] = [];
    let answer: string | null = null;
    let keep = true;

    try {
      for (let step = 0; step < MAX_STEPS && answer === null; step++) {
        const response = await claude.messages.create({
          model: MODEL,
          // Mails groupés : un modèle et une ligne par client, de quoi en préparer une quarantaine
          max_tokens: 8000,
          // Consignes et outils relus en cache d'une question à l'autre ; la conversation aussi
          system: [
            { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: context, cache_control: { type: 'ephemeral' } },
          ],
          cache_control: { type: 'ephemeral' },
          tools,
          output_config: { effort: 'low' },
          messages,
        });
        usage.input += response.usage.input_tokens;
        usage.output += response.usage.output_tokens;
        usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;
        usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

        if (response.stop_reason === 'refusal') {
          answer = 'Je ne peux pas répondre à cette question. Reformule-la autrement.';
          keep = false;
        } else if (response.stop_reason === 'pause_turn') {
          messages.push({ role: 'assistant', content: response.content });
        } else if (response.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: response.content });
          const calls = response.content.filter((block) => block.type === 'tool_use');
          const results = await Promise.all(
            calls.map(async (call) => {
              used.add(call.name);
              if (!allowed(call.name)) {
                return {
                  type: 'tool_result' as const,
                  tool_use_id: call.id,
                  content: 'Réservé à la direction',
                  is_error: true,
                };
              }
              if (isActionTool(call.name)) {
                // Action préparée seulement : la direction la valide ensuite dans l'appli
                const { actions, ...result } = await runAction(
                  ctx.supabase,
                  call.name,
                  call.input,
                  conversationId ?? null,
                );
                proposed.push(...actions);
                return { type: 'tool_result' as const, tool_use_id: call.id, ...result };
              }
              if (isDisplayTool(call.name)) {
                const { table, ...result } = runDisplay(call.input);
                if (table) tables.push(table);
                return { type: 'tool_result' as const, tool_use_id: call.id, ...result };
              }
              const result = await runTool(ctx.supabase, call.name, call.input);
              return { type: 'tool_result' as const, tool_use_id: call.id, ...result };
            }),
          );
          messages.push({ role: 'user', content: results });
        } else if (response.stop_reason === 'max_tokens') {
          return fail(502, 'Réponse trop longue : pose une question plus précise');
        } else {
          messages.push({ role: 'assistant', content: response.content });
          answer = answerText(response.content) || 'Je n’ai pas de réponse à cette question.';
        }
      }
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        return fail(503, 'Assistant occupé : réessaie dans un instant');
      }
      if (err instanceof Anthropic.APIError) {
        console.error('agent', err.status, err.message);
        return fail(502, 'Assistant indisponible pour le moment : réessaie dans un instant');
      }
      throw err;
    }
    if (answer === null) {
      answer = 'Je n’ai pas réussi à rassembler la réponse. Pose la question plus simplement.';
      keep = false;
    }

    // Un échange incomplet (refus, trop d'étapes) n'est pas gardé : la suite repart d'un état sain
    const nextTranscript = keep ? messages : transcript;
    let id = conversationId;
    if (id) {
      const { error } = await admin
        .from('agent_conversations')
        .update({ transcript: nextTranscript, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) console.error(error);
    } else {
      const { data, error } = await admin
        .from('agent_conversations')
        .insert({ profile_id: userId, title: conversationTitle(question), transcript: nextTranscript })
        .select('id')
        .single();
      if (error || !data) {
        console.error(error);
        return fail(500, 'Conversation non enregistrée : réessaie');
      }
      id = data.id as string;
      // Actions préparées dans une nouvelle conversation : rattachées à celle-ci
      if (proposed.length) {
        const { error: linkError } = await admin
          .from('agent_actions')
          .update({ conversation_id: id })
          .in('id', proposed.map((item) => item.id));
        if (linkError) console.error(linkError);
      }
    }

    const { data: turn, error: turnError } = await admin
      .from('agent_turns')
      .insert({
        conversation_id: id,
        profile_id: userId,
        question,
        answer,
        spoken,
        tools: [...used],
        tables,
        input_tokens: usage.input,
        output_tokens: usage.output,
        cache_read_tokens: usage.cacheRead,
        cache_write_tokens: usage.cacheWrite,
      })
      .select('id')
      .single();
    if (turnError) console.error(turnError); // réponse obtenue : le journal ne bloque pas

    return json(200, { conversation_id: id, turn_id: turn?.id ?? null, answer, actions: proposed, tables });
  }),
};

/** Point du jour renvoyé à la page (sans les jetons). */
function briefingView(
  row: { day: string; text: string; phrases: unknown; tools: string[]; updated_at: string },
) {
  return { day: row.day, text: row.text, phrases: row.phrases, tools: row.tools, updated_at: row.updated_at };
}
