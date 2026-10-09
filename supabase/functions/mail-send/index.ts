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
// Réponse préparée par l'Agent Direction (inbox_email_id) : réservée à la direction, envoyée dans
// le fil du mail reçu, qui est ensuite marqué répondu et traité.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { z } from 'zod';
import {
  attachmentsBytes,
  DAILY_LIMIT,
  MAX_ATTACHMENTS_BYTES,
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

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Adresse e-mail ou message invalide');
    const request = parsed.data;
    if (attachmentsBytes(request.attachments) > MAX_ATTACHMENTS_BYTES) {
      return fail(413, 'Pièces jointes trop lourdes (10 Mo maximum) : envoie le lien seul');
    }

    const admin = ctx.supabaseAdmin;
    let inReplyTo: string | null = null;
    if (request.inbox_email_id) {
      const { data: isDirection } = await ctx.supabase.rpc('is_direction');
      if (isDirection !== true) return fail(403, 'Réponse aux mails reçus réservée à la direction');
      const { data: received } = await admin
        .from('inbox_emails')
        .select('message_id, reply_status')
        .eq('id', request.inbox_email_id)
        .maybeSingle();
      if (!received) return fail(404, 'Mail reçu introuvable');
      if (received.reply_status === 'sent') return fail(409, 'Réponse déjà envoyée');
      inReplyTo = threadHeader(received.message_id);
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
    const sender = senderFor(request.category, settings, {
      from: fromAddress,
      replyTo: company?.email ?? null,
    });
    if (!sender) return fail(503, 'Renseigne le domaine d’envoi dans Réglages › Atelier');
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
    return json(200, { id: result.id });
  }),
};
