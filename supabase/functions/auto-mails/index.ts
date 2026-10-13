// =============================================================================
// Edge Function « auto-mails » : e-mails envoyés automatiquement au client (Resend).
//
// Appelée toutes les 15 minutes par la tâche planifiée run_auto_mails() (pg_cron → pg_net,
// secret partagé x-cron-secret), si la direction a activé l'envoi par l'appli et les envois
// automatiques. La base prépare les e-mails (prepare_auto_mails : rappel la veille, confirmation
// d'un rendez-vous demandé en ligne, échéances à 48 h et entretiens de contrat avec un lien de
// prise de rendez-vous) ; chaque résultat est noté (record_auto_mail) : un e-mail ne part qu'une fois.
// Secrets : RESEND_API_KEY, CRON_SECRET, APP_URL (adresse de l'appli pour les liens), MAIL_FROM
// tant qu'aucun domaine n'est réglé.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isCronRequest } from '../_shared/cron.ts';
import { DAILY_LIMIT, resendFailure, resendPayload, senderFor } from '../mail-send/mail.ts';
import { type AutoMailItem, buildAutoMail, isDeadline } from './messages.ts';

const json = (status: number, body: unknown) => Response.json(body, { status });

const apiKey = Deno.env.get('RESEND_API_KEY');
const fromAddress = Deno.env.get('MAIL_FROM');
const appUrl = Deno.env.get('APP_URL') ?? null;
const apiUrl = Deno.env.get('RESEND_API_URL') ?? 'https://api.resend.com';

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée' });
    if (!isCronRequest(req, Deno.env.get('CRON_SECRET'))) return json(401, { error: 'Accès refusé' });
    if (!apiKey) return json(503, { error: 'Envoi par l’appli pas encore configuré' });

    const admin = ctx.supabaseAdmin;
    const { data: settings } = await admin
      .from('app_settings')
      .select(
        'mail_send_enabled, auto_mails_enabled, mail_domain, mail_billing_local, mail_workshop_local, mail_signature_local',
      )
      .maybeSingle();
    if (!settings?.mail_send_enabled || !settings.auto_mails_enabled) {
      return json(200, { sent: 0, skipped: 'désactivé' });
    }
    const { data: company } = await admin.from('company_settings').select('legal_name, email, phone')
      .maybeSingle();
    const sender = senderFor('workshop', settings, { from: fromAddress, replyTo: company?.email ?? null });
    if (!sender) return json(503, { error: 'Domaine d’envoi non réglé' });

    const { data: prepared, error } = await admin.rpc('prepare_auto_mails');
    if (error) {
      console.error(error);
      return json(500, { error: 'Erreur inattendue' });
    }
    const items = ((prepared ?? []) as AutoMailItem[]).filter((item) => item.kind && item.to);

    const { count } = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    let budget = Math.max(0, DAILY_LIMIT - (count ?? 0));

    const context = { companyName: company?.legal_name ?? '', phone: company?.phone ?? null, appUrl };
    let sent = 0;
    let failed = 0;
    for (const item of items) {
      if (budget <= 0) break;
      const mail = buildAutoMail(item, context);
      if (!mail) {
        if (isDeadline(item.kind)) console.error('APP_URL absent : e-mail d’échéance non envoyé', item.key);
        continue;
      }
      const request = {
        category: 'workshop' as const,
        to: item.to,
        subject: mail.subject,
        text: mail.text,
        attachments: [],
        idempotency_key: crypto.randomUUID(),
        ...(mail.link ? { link: mail.link } : {}),
      };
      const response = await fetch(`${apiUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Même clé pour le même e-mail : Resend ne l'envoie pas deux fois
          'Idempotency-Key': `rts-auto-${item.key}`.slice(0, 256),
        },
        body: JSON.stringify(
          resendPayload(request, {
            name: company?.legal_name ?? '',
            address: sender.address,
            replyTo: sender.replyTo,
          }),
        ),
      });
      const result = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
      const ok = response.ok && !!result?.id;
      const failure = ok ? null : resendFailure(response.status, result?.message).error;
      if (!ok) console.error('Resend', response.status, result);

      const { error: recordError } = await admin.rpc('record_auto_mail', {
        p_key: item.key,
        p_kind: item.kind,
        p_recipient: item.to,
        p_client_id: item.client_id ?? undefined,
        p_vehicle_id: item.vehicle_id ?? undefined,
        p_appointment_id: item.appointment_id ?? undefined,
        p_provider_message_id: result?.id ?? undefined,
        p_error: failure ?? undefined,
      });
      if (recordError) console.error(recordError);
      if (ok) {
        sent++;
        budget--;
        const { error: logError } = await admin.from('email_deliveries').insert({
          provider_message_id: result!.id,
          recipient: item.to,
          subject: mail.subject,
          attachments: [],
          sender: sender.address,
          sent_by: null,
        });
        if (logError) console.error(logError);
      } else {
        failed++;
      }
    }
    return json(200, { sent, failed });
  }),
};
