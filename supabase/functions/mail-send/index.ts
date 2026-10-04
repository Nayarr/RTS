// =============================================================================
// Edge Function « mail-send » : envoi d'un e-mail au client par l'appli (service Resend).
//
// Appelée par le bureau depuis la fenêtre d'envoi (devis, facture, signature, contrat,
// rappel…) quand la direction a activé « Envoyer les e-mails depuis l'appli ». Le message
// part au nom de l'atelier (adresse MAIL_FROM d'un domaine vérifié chez Resend), les
// réponses du client arrivent sur l'e-mail de l'atelier (Réglages › Entreprise).
// Secrets : RESEND_API_KEY et MAIL_FROM (sans eux : envoi indisponible, la messagerie de
// l'ordinateur reste proposée). Chaque envoi est gardé dans email_deliveries.
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
    if (!apiKey || !fromAddress) {
      return fail(503, 'Envoi par l’appli pas encore configuré : passe par ta messagerie');
    }

    const { data: isOffice } = await ctx.supabase.rpc('is_office');
    if (isOffice !== true) return fail(403, 'Accès réservé au bureau');

    const { data: settings } = await ctx.supabase.from('app_settings').select('mail_send_enabled')
      .maybeSingle();
    if (!settings?.mail_send_enabled) return fail(409, 'Envoi par l’appli désactivé dans les réglages');

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail(400, 'Adresse e-mail ou message invalide');
    const request = parsed.data;
    if (attachmentsBytes(request.attachments) > MAX_ATTACHMENTS_BYTES) {
      return fail(413, 'Pièces jointes trop lourdes (10 Mo maximum) : envoie le lien seul');
    }

    const admin = ctx.supabaseAdmin;
    const { count } = await admin
      .from('email_deliveries')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', new Date(Date.now() - 24 * 3_600_000).toISOString());
    if ((count ?? 0) >= DAILY_LIMIT) {
      return fail(429, `Limite de ${DAILY_LIMIT} e-mails par jour atteinte : passe par ta messagerie`);
    }

    const { data: company } = await ctx.supabase.from('company_settings').select('legal_name, email')
      .maybeSingle();
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
          address: fromAddress,
          replyTo: company?.email ?? null,
        }),
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
      sent_by: ctx.userClaims?.id ?? null,
    });
    if (error) console.error(error); // e-mail parti : le journal ne bloque pas la réponse
    return json(200, { id: result.id });
  }),
};
