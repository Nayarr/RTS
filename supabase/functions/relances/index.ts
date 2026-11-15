// =============================================================================
// Edge Function « relances » : relance automatique des factures impayées (Resend).
//
// Appelée le lundi à 9 h (heure de Paris) par la tâche planifiée run_overdue_reminders() (pg_cron →
// pg_net, secret partagé x-cron-secret), si la direction a activé l'envoi par l'appli et la relance
// automatique. La base choisit les factures (prepare_overdue_reminders : échéance selon le type de compte,
// 6 jours entre deux relances, 3 relances au plus) ; un e-mail par client depuis l'adresse facturation ;
// chaque envoi est noté sur ses factures (record_overdue_reminder), puis un résumé part à la direction.
// Secrets : RESEND_API_KEY, CRON_SECRET, APP_URL (lien des factures), MAIL_FROM tant qu'aucun domaine.
// =============================================================================
import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { isCronRequest } from '../_shared/cron.ts';
import { DAILY_LIMIT, resendFailure, resendPayload, senderFor } from '../mail-send/mail.ts';
import { buildReminderMail, type ReminderItem } from './messages.ts';

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
        'mail_send_enabled, overdue_reminders_enabled, mail_domain, mail_billing_local, mail_workshop_local, mail_signature_local',
      )
      .maybeSingle();
    if (!settings?.mail_send_enabled || !settings.overdue_reminders_enabled) {
      return json(200, { sent: 0, skipped: 'désactivé' });
    }
    const { data: company } = await admin.from('company_settings').select('legal_name, email, phone')
      .maybeSingle();
    const sender = senderFor('billing', settings, { from: fromAddress, replyTo: company?.email ?? null });
    if (!sender) return json(503, { error: 'Domaine d’envoi non réglé' });

    const { data, error } = await admin.rpc('prepare_overdue_reminders');
    if (error) {
      console.error(error);
      return json(500, { error: 'Erreur inattendue' });
    }
    const items = ((data ?? []) as ReminderItem[]).filter((item) => item.to && item.invoices.length > 0);

    const { count } = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    let budget = Math.max(0, DAILY_LIMIT - (count ?? 0));
    const today = new Date().toISOString().slice(0, 10);
    const context = {
      companyName: company?.legal_name ?? '',
      phone: company?.phone ?? null,
      email: company?.email ?? null,
      appUrl,
    };

    let sent = 0;
    let failed = 0;
    let total = 0;
    for (const item of items) {
      if (budget <= 0) break;
      const mail = buildReminderMail(item, context);
      const response = await fetch(`${apiUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Même client le même jour : Resend n'envoie pas deux fois
          'Idempotency-Key': `rts-relance-${item.client_id}-${today}`,
        },
        body: JSON.stringify(
          resendPayload(
            {
              category: 'billing',
              to: item.to,
              subject: mail.subject,
              text: mail.text,
              attachments: [],
              idempotency_key: crypto.randomUUID(),
            },
            { name: company?.legal_name ?? '', address: sender.address, replyTo: sender.replyTo },
          ),
        ),
      });
      const result = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!response.ok || !result?.id) {
        console.error('Resend', response.status, resendFailure(response.status, result?.message).error);
        failed++;
        continue;
      }
      sent++;
      budget--;
      total += Number(item.balance);
      const recorded = await admin.rpc('record_overdue_reminder', {
        p_invoice_ids: item.invoices.map((invoice) => invoice.invoice_id),
        p_level: item.level,
      });
      if (recorded.error) console.error(recorded.error);
      const { error: logError } = await admin.from('email_deliveries').insert({
        provider_message_id: result.id,
        recipient: item.to,
        subject: mail.subject,
        attachments: [],
        sender: sender.address,
        sent_by: null,
      });
      if (logError) console.error(logError);
    }

    const { error: finishError } = await admin.rpc('finish_overdue_reminders', {
      p_clients: sent,
      p_total: Math.round(total * 100) / 100,
      p_failed: failed,
    });
    if (finishError) console.error(finishError);
    return json(200, { sent, failed });
  }),
};
