// =============================================================================
// Edge Function « mail-inbox » : mails reçus par les boîtes de l'atelier, triés pour la direction.
//
// Les boîtes de l'atelier (o2switch) renvoient une copie de chaque mail à l'adresse de réception
// Resend ; Resend appelle cette fonction (webhook « email.received », signé avec le secret
// RESEND_WEBHOOK_SECRET). La fonction lit le contenu du mail à l'API Resend, le garde en texte
// brut (inbox_emails), reconnaît le client par son adresse, puis le fait trier par Claude Haiku
// (secret ANTHROPIC_AGENT_API_KEY). Ignorés : Agent Direction désactivé, mail adressé à aucune
// boîte du domaine de l'atelier (Réglages › Atelier).
//
// Un mail qui attend une réponse (devis, intervention, suivi…) reçoit ensuite, en tâche de fond,
// une réponse préparée par Claude Sonnet (reply.ts) : la direction l'écoute dans le point du jour
// et décide de l'envoyer. Rien n'est envoyé ici.
//
// Appelée aussi par la tâche planifiée retry_inbox_triage (en-tête x-cron-secret) pour trier
// les mails et préparer les réponses restés en attente.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { isCronRequest } from '../_shared/cron.ts';
import {
  atelierDomain,
  atelierMailbox,
  deliveryRecipients,
  exactLike,
  mailBody,
  parseAddress,
  receivedEmailSchema,
  verifyWebhook,
  webhookSchema,
} from './inbox.ts';
import {
  parseTriage,
  type Triage,
  TRIAGE_JSON_SCHEMA,
  TRIAGE_MODEL,
  TRIAGE_SYSTEM,
  triageRequest,
} from './triage.ts';
import {
  parseReply,
  REPLY_CATEGORIES,
  REPLY_DAILY_LIMIT,
  REPLY_JSON_SCHEMA,
  REPLY_MAX_STEPS,
  REPLY_MODEL,
  REPLY_SYSTEM,
  REPLY_TOOL_NAMES,
  REPLY_TOOLS,
  replyRequest,
} from './reply.ts';
import { parisToday } from '../agent/prompt.ts';
import { runTool } from '../agent/tools.ts';

z.config(z.locales.fr());

/** Garde-fou contre un envoi en masse vers la boîte : mails triés par période de 24 h. */
const DAILY_LIMIT = 400;
/** Mails triés à chaque passage de la tâche de secours. */
const RETRY_BATCH = 20;
/** Réponses préparées à chaque passage de la tâche de secours (une dizaine de secondes chacune). */
const REPLY_BATCH = 5;

const json = (status: number, body: unknown) => Response.json(body, { status });

const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
// Clé Resend avec accès complet (la lecture des mails reçus n'est pas permise aux clés d'envoi)
const resendKey = Deno.env.get('RESEND_RECEIVING_API_KEY') ?? Deno.env.get('RESEND_API_KEY');
const resendUrl = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com';
const mailFrom = Deno.env.get('MAIL_FROM');
const anthropicKey = Deno.env.get('ANTHROPIC_AGENT_API_KEY');
const anthropicUrl = Deno.env.get('ANTHROPIC_AGENT_API_URL');
const claude = anthropicKey
  ? new Anthropic({
    apiKey: anthropicKey,
    ...(anthropicUrl ? { baseURL: anthropicUrl } : {}),
    maxRetries: 2,
    timeout: 60_000,
  })
  : null;

interface PendingMail {
  id: string;
  received_at: string;
  mailbox: string | null;
  from_name: string;
  from_address: string;
  subject: string;
  body: string;
  attachments: { filename?: string | null }[];
  triage_attempts: number;
  clients: { name: string } | null;
}

/** L'expéditeur attend une réponse que l'agent peut préparer (ni publicité, ni administratif…). */
const wantsReply = (result: Pick<Triage, 'needs_reply' | 'category'>) =>
  result.needs_reply && REPLY_CATEGORIES.includes(result.category);

/** Trie un mail et enregistre le résultat ; en cas d'échec, il reste en attente pour un nouvel essai. */
async function triage(admin: SupabaseClient, mail: PendingMail): Promise<Triage | null> {
  if (!claude) return null;
  await admin.from('inbox_emails').update({ triage_attempts: mail.triage_attempts + 1 }).eq('id', mail.id);
  try {
    const response = await claude.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 400,
      system: TRIAGE_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: TRIAGE_JSON_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: triageRequest({
            receivedOn: parisToday(new Date(mail.received_at)),
            mailbox: mail.mailbox,
            fromName: mail.from_name,
            fromAddress: mail.from_address,
            clientName: mail.clients?.name ?? null,
            subject: mail.subject,
            attachments: mail.attachments.map((file) => file.filename ?? 'fichier'),
            body: mail.body,
          }),
        },
      ],
    });
    const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    const parsed = parseTriage(text);
    if (!parsed) {
      console.error('mail-inbox tri illisible', response.stop_reason);
      return null;
    }
    const { renouvellements, ...result } = parsed;
    const { error } = await admin
      .from('inbox_emails')
      .update({
        ...result,
        triage_status: 'done',
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        ...(wantsReply(result) ? { reply_status: 'pending' } : {}),
      })
      .eq('id', mail.id);
    if (error) console.error(error);
    // Contrôle renouvelé annoncé par le client : dates cohérentes proposées pour la fiche véhicule
    if (!error && renouvellements.length) {
      const { error: proposeError } = await admin.rpc('propose_inbox_deadline_updates', {
        p_mail_id: mail.id,
        p_items: renouvellements,
      });
      if (proposeError) console.error(proposeError);
    }
    return error ? null : parsed;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('mail-inbox tri', err.status, err.message);
      return null;
    }
    throw err;
  }
}

interface ReplyMail {
  id: string;
  mailbox: string | null;
  from_name: string;
  from_address: string;
  subject: string;
  body: string;
  summary: string | null;
  reply_attempts: number;
  clients: { name: string } | null;
}
const REPLY_COLUMNS =
  'id, mailbox, from_name, from_address, subject, body, summary, reply_attempts, clients(name)';

/**
 * Prépare la réponse d'un mail : l'agent lit les données utiles (outils en lecture seule, client de
 * service : la réponse n'est lue que par la direction), puis écrit. En cas d'échec, la réponse reste
 * en attente pour la tâche de secours (3 essais).
 */
async function prepareReply(admin: SupabaseClient, mailId: string): Promise<boolean> {
  if (!claude) return false;
  const { data } = await admin.from('inbox_emails').select(REPLY_COLUMNS).eq('id', mailId).maybeSingle();
  const mail = data as unknown as ReplyMail | null;
  if (!mail) return false;
  await admin.from('inbox_emails').update({ reply_attempts: mail.reply_attempts + 1 }).eq('id', mail.id);

  const { count } = await admin
    .from('inbox_emails')
    .select('id', { count: 'exact', head: true })
    .gte('reply_prepared_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
  if ((count ?? 0) >= REPLY_DAILY_LIMIT) {
    await admin.from('inbox_emails').update({ reply_status: 'failed' }).eq('id', mail.id);
    return false;
  }
  const { data: company } = await admin.from('company_settings').select('legal_name').maybeSingle();

  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: replyRequest({
      today: parisToday(),
      company: String(company?.legal_name ?? ''),
      mailbox: mail.mailbox,
      fromName: mail.from_name,
      fromAddress: mail.from_address,
      clientName: mail.clients?.name ?? null,
      subject: mail.subject,
      body: mail.body,
      summary: mail.summary,
    }),
  }];
  const used = new Set<string>();
  const usage = { input: 0, output: 0 };
  try {
    for (let step = 0; step < REPLY_MAX_STEPS; step++) {
      const response = await claude.messages.create({
        model: REPLY_MODEL,
        max_tokens: 3000,
        system: [{ type: 'text', text: REPLY_SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: REPLY_TOOLS,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: REPLY_JSON_SCHEMA } },
        messages,
      });
      usage.input += response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
      usage.output += response.usage.output_tokens;
      if (response.stop_reason === 'tool_use' || response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        const calls = response.content.filter((block) => block.type === 'tool_use');
        if (calls.length) {
          const results = await Promise.all(calls.map(async (call) => {
            // Seules les lectures prévues pour les réponses sont permises
            if (!(REPLY_TOOL_NAMES as readonly string[]).includes(call.name)) {
              return {
                type: 'tool_result' as const,
                tool_use_id: call.id,
                content: 'Outil indisponible',
                is_error: true,
              };
            }
            used.add(call.name);
            return {
              type: 'tool_result' as const,
              tool_use_id: call.id,
              ...(await runTool(admin, call.name, call.input)),
            };
          }));
          messages.push({ role: 'user', content: results });
        }
        continue;
      }
      const text = response.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      const reply = response.stop_reason === 'end_turn' ? parseReply(text) : null;
      if (!reply) {
        console.error('mail-inbox réponse illisible', response.stop_reason);
        return false;
      }
      const { error } = await admin
        .from('inbox_emails')
        .update({
          reply_status: 'ready',
          reply_request: reply.demande,
          reply_subject: reply.objet,
          reply_body: reply.texte,
          reply_basis: reply.appui || null,
          reply_tools: [...used],
          reply_input_tokens: usage.input,
          reply_output_tokens: usage.output,
          reply_prepared_at: new Date().toISOString(),
        })
        .eq('id', mail.id)
        .eq('reply_status', 'pending');
      if (error) console.error(error);
      return !error;
    }
    console.error('mail-inbox réponse : trop d’étapes');
    return false;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('mail-inbox réponse', err.status, err.message);
      return false;
    }
    throw err;
  }
}

type WebhookResult =
  | 'stored'
  | 'duplicate'
  | 'agent_disabled'
  | 'not_atelier'
  | 'bad_signature'
  | 'bad_event'
  | 'resend_key_missing'
  | 'resend_error'
  | 'error';

/** Dernier appel de Resend et son résultat, affichés dans Mails reçus (une seule ligne gardée). */
async function noteWebhook(
  admin: SupabaseClient,
  result: WebhookResult,
  details: { recipients?: string[]; domain?: string | null } = {},
) {
  const { error } = await admin.from('inbox_webhook_status').upsert({
    id: true,
    received_at: new Date().toISOString(),
    result,
    recipients: (details.recipients ?? []).slice(0, 10).map((value) => value.slice(0, 320)),
    domain: details.domain ?? null,
  });
  if (error) console.error('mail-inbox suivi', error);
}

/** Lance un travail après la réponse au webhook (Resend n'attend pas la réponse préparée). */
function inBackground(work: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void } })
    .EdgeRuntime;
  const guarded = work.catch((err) => console.error('mail-inbox tâche de fond', err));
  if (runtime) runtime.waitUntil(guarded);
}

const PENDING_COLUMNS =
  'id, received_at, mailbox, from_name, from_address, subject, body, attachments, triage_attempts, clients(name)';

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
    const admin = ctx.supabaseAdmin;

    // ---------------------------------------------------------------- tâche de secours
    if (req.headers.has('x-cron-secret')) {
      if (!isCronRequest(req, Deno.env.get('CRON_SECRET'))) return json(401, { error: 'Accès refusé' });
      if (!claude) return json(503, { error: 'Tri pas encore configuré' });
      const { data } = await admin
        .from('inbox_emails')
        .select(PENDING_COLUMNS)
        .eq('triage_status', 'pending')
        .order('created_at')
        .limit(RETRY_BATCH);
      let sorted = 0;
      for (const mail of (data ?? []) as unknown as PendingMail[]) {
        if (await triage(admin, mail)) sorted++;
      }
      const { data: replies } = await admin
        .from('inbox_emails')
        .select('id')
        .eq('reply_status', 'pending')
        .order('created_at')
        .limit(REPLY_BATCH);
      let prepared = 0;
      for (const mail of replies ?? []) {
        if (await prepareReply(admin, String(mail.id))) prepared++;
      }
      return json(200, { sorted, prepared });
    }

    // ---------------------------------------------------------------- webhook Resend
    const raw = await req.text();
    const signed = await verifyWebhook(
      webhookSecret,
      {
        id: req.headers.get('svix-id'),
        timestamp: req.headers.get('svix-timestamp'),
        signature: req.headers.get('svix-signature'),
      },
      raw,
    );
    if (!signed) {
      await noteWebhook(admin, 'bad_signature');
      return json(401, { error: 'Signature invalide' });
    }

    let payload: unknown = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // corps illisible : refusé ci-dessous
    }
    const event = webhookSchema.safeParse(payload);
    if (!event.success) {
      await noteWebhook(admin, 'bad_event');
      return json(400, { error: 'Événement illisible' });
    }
    if (event.data.type !== 'email.received' || !event.data.data) return json(200, { ignored: 'événement' });
    const received = event.data.data;

    const { data: settings } = await admin.from('app_settings').select('agent_enabled, mail_domain')
      .maybeSingle();
    if (!settings?.agent_enabled) {
      await noteWebhook(admin, 'agent_disabled');
      return json(200, { ignored: 'agent désactivé' });
    }
    const domain = atelierDomain(settings.mail_domain, mailFrom);

    // Webhook rejoué, ou même mail reçu par deux boîtes de l'atelier : gardé une seule fois
    const known = await Promise.all([
      admin.from('inbox_emails').select('id').eq('provider_id', received.email_id).limit(1),
      received.message_id
        ? admin.from('inbox_emails').select('id').eq('message_id', received.message_id).limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    if (known.some((result) => result.data?.length)) {
      await noteWebhook(admin, 'duplicate', { domain });
      return json(200, { ignored: 'déjà reçu' });
    }

    const { count } = await admin
      .from('inbox_emails')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    const overLimit = (count ?? 0) >= DAILY_LIMIT;

    if (!resendKey) {
      await noteWebhook(admin, 'resend_key_missing', { domain });
      return json(503, { error: 'Clé Resend absente' });
    }
    const response = await fetch(`${resendUrl}/emails/receiving/${encodeURIComponent(received.email_id)}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    if (!response.ok) {
      console.error('Resend réception', response.status);
      await noteWebhook(admin, 'resend_error', { domain });
      // Resend rejoue le webhook plus tard
      return json(502, { error: 'Contenu du mail indisponible' });
    }
    const content = receivedEmailSchema.safeParse(await response.json().catch(() => null));

    // Boîte de l'atelier : « À » et « Cc », sinon en-têtes de remise (copie cachée, redirecteur)
    const listed = [...received.to, ...(received.cc ?? [])];
    const delivered = content.success ? deliveryRecipients(content.data.headers) : [];
    const mailbox = atelierMailbox(listed, domain) ?? atelierMailbox(delivered, domain);
    if (!mailbox) {
      await noteWebhook(admin, 'not_atelier', { recipients: [...listed, ...delivered], domain });
      return json(200, { ignored: 'hors des boîtes de l’atelier' });
    }

    const from = parseAddress(received.from);
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .ilike('email', exactLike(from.address))
      .limit(1)
      .maybeSingle();

    const { data: saved, error } = await admin
      .from('inbox_emails')
      .insert({
        provider_id: received.email_id,
        message_id: received.message_id || null,
        mailbox,
        from_name: from.name.slice(0, 200),
        from_address: from.address.slice(0, 320),
        to_addresses: received.to.slice(0, 20),
        subject: (received.subject ?? '').slice(0, 500),
        body: mailBody(content.success ? content.data : {}),
        attachments: (received.attachments ?? []).slice(0, 20).map((file) => ({
          filename: file.filename ?? null,
          content_type: file.content_type ?? null,
        })),
        received_at: received.created_at ?? new Date().toISOString(),
        client_id: client?.id ?? null,
        // Afflux anormal : mail gardé sans tri automatique
        triage_status: overLimit ? 'failed' : 'pending',
      })
      .select(PENDING_COLUMNS)
      .single();
    if (error || !saved) {
      // Même mail reçu en même temps par deux boîtes : déjà gardé
      if (error?.code === '23505') return json(200, { ignored: 'déjà reçu' });
      console.error(error);
      await noteWebhook(admin, 'error', { domain });
      return json(500, { error: 'Mail non enregistré' });
    }
    await noteWebhook(admin, 'stored', { domain });
    if (overLimit) return json(200, { stored: true, sorted: false });

    const result = await triage(admin, saved as unknown as PendingMail);
    const replying = Boolean(result && wantsReply(result));
    if (replying) inBackground(prepareReply(admin, String((saved as { id: string }).id)));
    return json(200, { stored: true, sorted: Boolean(result), replying });
  }),
};
