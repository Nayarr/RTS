// =============================================================================
// Edge Function « mail-send » : envoi d'un e-mail au client par l'appli (service Resend).
//
// Appelée par le bureau depuis la fenêtre d'envoi (devis, facture, signature, contrat,
// rappel…) quand la direction a activé « Envoyer les e-mails depuis l'appli ». Le message
// part au nom de l'atelier, depuis l'adresse de son type (Réglages › Atelier, domaine vérifié
// chez Resend) : facturation@ (devis, factures, contrats), atelier@ (infos du véhicule,
// rappels), signature@ (liens de signature) ; les réponses reviennent sur cette adresse.
// Secrets : RESEND_API_KEY, et MAIL_FROM tant qu'aucun domaine n'est réglé (sans eux : envoi
// indisponible, la messagerie de l'ordinateur reste proposée). Chaque envoi est gardé dans
// email_deliveries.
// Réponse préparée par l'Agent Direction (inbox_email_id) : envoyée par le bureau (direction ou
// réception) dans le fil du mail reçu, depuis la boîte qui l'a reçu (comptoir@, atelier@), puis le
// mail reçu est marqué répondu et traité.
// Mail préparé par l'Agent Direction (agent_action_id) : envoyé par la personne du bureau qui l'a
// demandé (direction ou réception) ; le contenu est relu dans l'action (jamais pris dans la
// requête), l'action est marquée faite et, pour une relance, la relance est notée sur chaque facture.
// Mail groupé de l'agent (action send_mailing) : un mail par client, son adresse seule, envoyés par
// paquets de 100 (envoi groupé de Resend) ; un paquet parti n'est pas renvoyé si l'envoi reprend.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { type SupabaseContext, withSupabase } from '@supabase/server';
import { z } from 'zod';
import {
  agentMailDeadlines,
  agentMailRequest,
  agentMailRequestSchema,
  attachmentsBytes,
  batches,
  DAILY_LIMIT,
  mailingMessages,
  MAX_ATTACHMENTS_BYTES,
  replySender,
  requestSchema,
  resendFailure,
  resendPayload,
  senderFor,
  threadHeader,
} from './mail.ts';

z.config(z.locales.fr());

const json = (status: number, body: unknown) => Response.json(body, { status });
const fail = (status: number, error: string) => json(status, { error });

const apiKey = Deno.env.get('RESEND_API_KEY');
const fromAddress = Deno.env.get('MAIL_FROM');
// Adresse de l'API (remplaçable pour les tests locaux)
const apiUrl = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com';

type Ctx = SupabaseContext;
type Settings = Parameters<typeof senderFor>[1];

/**
 * Mail groupé validé par la direction : un mail par client, par paquets de 100. Chaque paquet parti
 * est noté sur l'action (sent_batches) : un nouvel essai reprend au paquet suivant.
 */
async function sendMailing(
  ctx: Ctx,
  settings: Settings,
  action: { id: string; done: number },
  messages: { to: string; subject: string; text: string }[],
): Promise<Response> {
  const admin = ctx.supabaseAdmin;
  const groups = batches(messages);
  const left = groups.slice(action.done).flat().length;
  const { count } = await admin
    .from('email_deliveries')
    .select('id', { count: 'exact', head: true })
    .gte('sent_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
  if ((count ?? 0) + left > DAILY_LIMIT) {
    return fail(
      429,
      `Limite de ${DAILY_LIMIT} e-mails par jour : il en reste ${
        Math.max(0, DAILY_LIMIT - (count ?? 0))
      } aujourd’hui pour ${left} clients, retire des destinataires ou envoie demain`,
    );
  }
  const { data: company } = await ctx.supabase.from('company_settings').select('legal_name, email')
    .maybeSingle();
  const sender = senderFor('workshop', settings, { from: fromAddress, replyTo: company?.email ?? null });
  if (!sender) return fail(503, 'Renseigne le domaine d’envoi dans Réglages › Atelier');
  const userId = ctx.userClaims?.id ?? null;

  for (let index = action.done; index < groups.length; index += 1) {
    const group = groups[index]!;
    const response = await fetch(`${apiUrl}/emails/batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `${action.id}-${index}`,
      },
      body: JSON.stringify(
        group.map((message) =>
          resendPayload(
            { category: 'workshop', ...message, attachments: [], idempotency_key: action.id },
            { name: company?.legal_name ?? '', address: sender.address, replyTo: sender.replyTo },
          )
        ),
      ),
    });
    const result = (await response.json().catch(() => null)) as
      | { data?: { id?: string }[]; message?: string }
      | null;
    if (!response.ok || !Array.isArray(result?.data)) {
      console.error('Resend batch', response.status, result);
      const failure = resendFailure(response.status, result?.message);
      const sent = groups.slice(0, index).flat().length;
      return fail(failure.status, sent ? `${failure.error} (${sent} mails déjà partis)` : failure.error);
    }
    const { error } = await admin.from('email_deliveries').insert(
      group.map((message, at) => ({
        provider_message_id: result.data?.[at]?.id ?? null,
        recipient: message.to,
        subject: message.subject,
        attachments: [],
        sender: sender.address,
        sent_by: userId,
      })),
    );
    if (error) console.error(error); // e-mails partis : le journal ne bloque pas la suite
    await admin.from('agent_actions').update({ result: { sent_batches: index + 1 } }).eq('id', action.id);
  }

  const { error: actionError } = await admin
    .from('agent_actions')
    .update({
      status: 'done',
      decided_at: new Date().toISOString(),
      result: { sent_batches: groups.length, sent: messages.length },
    })
    .eq('id', action.id)
    .eq('status', 'proposed');
  if (actionError) console.error(actionError);
  return json(200, { sent: messages.length });
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
    if (!apiKey) {
      return fail(503, 'Envoi par l’appli pas encore configuré : passe par ta messagerie');
    }

    const { data: isOffice } = await ctx.supabase.rpc('is_office');
    if (isOffice !== true) return fail(403, 'Accès réservé au bureau');

    const { data: settings } = await ctx.supabase
      .from('app_settings')
      .select('mail_send_enabled, mail_domain, mail_billing_local, mail_workshop_local, mail_signature_local')
      .maybeSingle();
    if (!settings?.mail_send_enabled) return fail(409, 'Envoi par l’appli désactivé dans les réglages');

    const body = await req.json().catch(() => null);
    const admin = ctx.supabaseAdmin;

    // Mail préparé par l'agent : contenu lu dans l'action, avec les droits de la personne connectée
    const agentMail = agentMailRequestSchema.safeParse(body);
    let agentAction:
      | { id: string; invoice_ids: string[]; deadlines: ReturnType<typeof agentMailDeadlines> }
      | null = null;
    let parsed = requestSchema.safeParse(body);
    if (agentMail.success) {
      const { data: action } = await ctx.supabase
        .from('agent_actions')
        .select('id, kind, status, payload, result, created_at')
        .eq('id', agentMail.data.agent_action_id)
        .maybeSingle();
      if (!action || !['send_mail', 'send_mailing'].includes(action.kind)) {
        return fail(404, 'Mail préparé introuvable');
      }
      if (action.status !== 'proposed') return fail(409, 'Mail déjà envoyé ou annulé');
      // Mail préparé : relu et modifié à son rythme, valable 24 h
      if (Date.parse(action.created_at) < Date.now() - 24 * 3_600_000) {
        await admin.from('agent_actions').update({
          status: 'cancelled',
          decided_at: new Date().toISOString(),
          error: 'Expirée',
        }).eq('id', action.id).eq('status', 'proposed');
        return fail(410, 'Mail préparé il y a plus de 24 heures : redemande-le à l’agent');
      }
      if (action.kind === 'send_mailing') {
        const messages = mailingMessages(action.payload);
        if (!messages) return fail(400, 'Mail groupé illisible');
        const done = Number(
          (action as { result?: { sent_batches?: unknown } | null }).result?.sent_batches ?? 0,
        );
        return await sendMailing(
          ctx,
          settings,
          { id: action.id, done: Number.isFinite(done) ? done : 0 },
          messages,
        );
      }
      const prepared = agentMailRequest(action.payload, agentMail.data.idempotency_key);
      if (!prepared) return fail(400, 'Mail préparé illisible');
      parsed = requestSchema.safeParse(prepared);
      const ids = (action.payload as { invoice_ids?: unknown }).invoice_ids;
      agentAction = {
        id: action.id,
        invoice_ids: Array.isArray(ids) ? ids.map(String) : [],
        deadlines: agentMailDeadlines(action.payload),
      };
      // Relance d'échéances : jamais deux fois en 3 mois (page Échéances, autre mail, rappel)
      for (const deadline of agentAction.deadlines) {
        const { data: reminded } = await ctx.supabase.rpc('deadline_recently_reminded', {
          p_vehicle_id: deadline.vehicle_id,
          p_kind: deadline.kind,
        });
        if (reminded) {
          return fail(409, 'Véhicule déjà relancé depuis moins de 3 mois : redemande le mail à l’agent');
        }
      }
    }
    if (!parsed.success) return fail(400, 'Adresse e-mail ou message invalide');
    const request = parsed.data;
    if (attachmentsBytes(request.attachments) > MAX_ATTACHMENTS_BYTES) {
      return fail(413, 'Pièces jointes trop lourdes (10 Mo maximum) : envoie le lien seul');
    }

    let inReplyTo: string | null = null;
    let mailbox: string | null = null;
    if (request.inbox_email_id) {
      const { data: received } = await admin
        .from('inbox_emails')
        .select('message_id, reply_status, mailbox')
        .eq('id', request.inbox_email_id)
        .maybeSingle();
      if (!received) return fail(404, 'Mail reçu introuvable');
      if (received.reply_status === 'sent') return fail(409, 'Réponse déjà envoyée');
      inReplyTo = threadHeader(received.message_id);
      mailbox = received.mailbox;
    }
    const { count } = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      return fail(429, `Limite de ${DAILY_LIMIT} e-mails par jour atteinte : passe par ta messagerie`);
    }

    const { data: company } = await ctx.supabase.from('company_settings').select('legal_name, email')
      .maybeSingle();
    const usual = senderFor(request.category, settings, {
      from: fromAddress,
      replyTo: company?.email ?? null,
    });
    if (!usual) return fail(503, 'Renseigne le domaine d’envoi dans Réglages › Atelier');
    const sender = replySender(usual, mailbox);
    const response = await fetch(`${apiUrl}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': request.idempotency_key,
      },
      body: JSON.stringify(
        resendPayload(request, {
          name: company?.legal_name ?? '',
          address: sender.address,
          replyTo: sender.replyTo,
        }, inReplyTo),
      ),
    });
    const result = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (!response.ok || !result?.id) {
      console.error('Resend', response.status, result);
      const failure = resendFailure(response.status, result?.message);
      return fail(failure.status, failure.error);
    }

    const { error } = await admin.from('email_deliveries').insert({
      provider_message_id: result.id,
      recipient: request.to,
      subject: request.subject,
      attachments: request.attachments.map((file) => file.filename),
      sender: sender.address,
      sent_by: ctx.userClaims?.id ?? null,
    });
    if (error) console.error(error); // e-mail parti : le journal ne bloque pas la réponse
    if (request.inbox_email_id) {
      const now = new Date().toISOString();
      const userId = ctx.userClaims?.id ?? null;
      const { error: replyError } = await admin
        .from('inbox_emails')
        .update({
          reply_status: 'sent',
          reply_sent_at: now,
          reply_sent_by: userId,
          reply_provider_id: result.id,
        })
        .eq('id', request.inbox_email_id);
      if (replyError) console.error(replyError);
      await admin
        .from('inbox_emails')
        .update({ handled_at: now, handled_by: userId })
        .eq('id', request.inbox_email_id)
        .is('handled_at', null);
    }
    if (agentAction) {
      const userId = ctx.userClaims?.id ?? null;
      const { error: actionError } = await admin
        .from('agent_actions')
        .update({
          status: 'done',
          decided_at: new Date().toISOString(),
          result: {
            provider_message_id: result.id,
            link: agentAction.invoice_ids.length ? '/factures' : null,
          },
        })
        .eq('id', agentAction.id)
        .eq('status', 'proposed');
      if (actionError) console.error(actionError);
      if (agentAction.invoice_ids.length) {
        const { error: reminderError } = await admin
          .from('invoice_reminders')
          .insert(agentAction.invoice_ids.map((invoice_id) => ({ invoice_id, sent_by: userId })));
        if (reminderError) console.error(reminderError);
      }
      if (agentAction.deadlines.length) {
        const { error: deadlineError } = await ctx.supabase.rpc('record_deadline_reminders', {
          p_items: agentAction.deadlines,
          p_source: 'agent',
        });
        if (deadlineError) console.error(deadlineError);
      }
    }
    return json(200, { id: result.id });
  }),
};
