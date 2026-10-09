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
// Appelée aussi par la tâche planifiée retry_inbox_triage (en-tête x-cron-secret) pour trier
// les mails restés en attente.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import { isCronRequest } from '../_shared/cron.ts';
import {
  atelierMailbox,
  exactLike,
  mailBody,
  parseAddress,
  receivedEmailSchema,
  verifyWebhook,
  webhookSchema,
} from './inbox.ts';
import { parseTriage, TRIAGE_JSON_SCHEMA, TRIAGE_MODEL, TRIAGE_SYSTEM, triageRequest } from './triage.ts';

z.config(z.locales.fr());

/** Garde-fou contre un envoi en masse vers la boîte : mails triés par période de 24 h. */
const DAILY_LIMIT = 400;
/** Mails triés à chaque passage de la tâche de secours. */
const RETRY_BATCH = 20;

const json = (status: number, body: unknown) => Response.json(body, { status });

const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
// Clé Resend avec accès complet (la lecture des mails reçus n'est pas permise aux clés d'envoi)
const resendKey = Deno.env.get('RESEND_RECEIVING_API_KEY') ?? Deno.env.get('RESEND_API_KEY');
const resendUrl = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com';
const anthropicKey = Deno.env.get('ANTHROPIC_AGENT_API_KEY');
const anthropicUrl = Deno.env.get('ANTHROPIC_AGENT_API_URL');
const claude = anthropicKey
  ? new Anthropic({
    apiKey: anthropicKey,
    ...(anthropicUrl ? { baseURL: anthropicUrl } : {}),
    maxRetries: 2,
    timeout: 30_000,
  })
  : null;

interface PendingMail {
  id: string;
  mailbox: string | null;
  from_name: string;
  from_address: string;
  subject: string;
  body: string;
  attachments: { filename?: string | null }[];
  triage_attempts: number;
  clients: { name: string } | null;
}

/** Trie un mail et enregistre le résultat ; en cas d'échec, il reste en attente pour un nouvel essai. */
async function triage(admin: SupabaseClient, mail: PendingMail): Promise<boolean> {
  if (!claude) return false;
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
    const result = parseTriage(text);
    if (!result) {
      console.error('mail-inbox tri illisible', response.stop_reason);
      return false;
    }
    const { error } = await admin
      .from('inbox_emails')
      .update({
        ...result,
        triage_status: 'done',
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      })
      .eq('id', mail.id);
    if (error) console.error(error);
    return !error;
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('mail-inbox tri', err.status, err.message);
      return false;
    }
    throw err;
  }
}

const PENDING_COLUMNS =
  'id, mailbox, from_name, from_address, subject, body, attachments, triage_attempts, clients(name)';

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
      return json(200, { sorted });
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
    if (!signed) return json(401, { error: 'Signature invalide' });

    let payload: unknown = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // corps illisible : refusé ci-dessous
    }
    const event = webhookSchema.safeParse(payload);
    if (!event.success) return json(400, { error: 'Événement illisible' });
    if (event.data.type !== 'email.received' || !event.data.data) return json(200, { ignored: 'événement' });
    const received = event.data.data;

    const { data: settings } = await admin.from('app_settings').select('agent_enabled, mail_domain')
      .maybeSingle();
    if (!settings?.agent_enabled) return json(200, { ignored: 'agent désactivé' });
    const mailbox = atelierMailbox([...received.to, ...(received.cc ?? [])], settings.mail_domain);
    if (!mailbox) return json(200, { ignored: 'hors des boîtes de l’atelier' });

    // Webhook rejoué, ou même mail reçu par deux boîtes de l'atelier : gardé une seule fois
    const known = await Promise.all([
      admin.from('inbox_emails').select('id').eq('provider_id', received.email_id).limit(1),
      received.message_id
        ? admin.from('inbox_emails').select('id').eq('message_id', received.message_id).limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    if (known.some((result) => result.data?.length)) return json(200, { ignored: 'déjà reçu' });

    const { count } = await admin
      .from('inbox_emails')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    const overLimit = (count ?? 0) >= DAILY_LIMIT;

    if (!resendKey) return json(503, { error: 'Clé Resend absente' });
    const response = await fetch(`${resendUrl}/emails/receiving/${encodeURIComponent(received.email_id)}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    if (!response.ok) {
      console.error('Resend réception', response.status);
      // Resend rejoue le webhook plus tard
      return json(502, { error: 'Contenu du mail indisponible' });
    }
    const content = receivedEmailSchema.safeParse(await response.json().catch(() => null));

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
      return json(500, { error: 'Mail non enregistré' });
    }
    if (overLimit) return json(200, { stored: true, sorted: false });

    const sorted = await triage(admin, saved as unknown as PendingMail);
    return json(200, { stored: true, sorted });
  }),
};
