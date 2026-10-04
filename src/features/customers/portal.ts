import type { SendLinkMessage } from '@/lib/send-links';
import { supabase } from '@/lib/supabase';

/** Lien permanent de l'espace client (créé au premier envoi). Retourne le jeton. */
export async function shareClientPortal(clientId: string): Promise<string> {
  const { data, error } = await supabase.rpc('share_client_portal', { p_client_id: clientId });
  if (error) throw error;
  return data;
}

/** Nouveau lien : l'ancien cesse aussitôt de fonctionner. */
export async function resetClientPortal(clientId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reset_client_portal', { p_client_id: clientId });
  if (error) throw error;
  return data;
}

/** Le client a-t-il déjà un lien d'espace client ? */
export async function hasClientPortal(clientId: string): Promise<boolean> {
  const { data, error } = await supabase.from('clients').select('portal_token').eq('id', clientId).single();
  if (error) throw error;
  return data.portal_token !== null;
}

/** Trace l'envoi du lien (fiche client). */
export async function recordPortalMessage(input: {
  clientId: string;
  channel: 'email' | 'sms';
  recipient: string | null;
  message: SendLinkMessage;
  /** Identifiant Resend : e-mail envoyé par l'appli. */
  providerMessageId?: string | undefined;
}) {
  const { error } = await supabase.from('client_messages').insert({
    client_id: input.clientId,
    message_type: 'portal_link',
    channel: input.channel,
    recipient: input.recipient,
    subject: input.channel === 'email' ? input.message.subject : null,
    body: input.channel === 'email' ? input.message.body : input.message.sms,
    provider_message_id: input.providerMessageId ?? null,
  });
  if (error) throw error;
}

/** Message de l'ancienne appli, signé avec les coordonnées des Réglages. */
export function portalMessage(
  link: string,
  company: { legal_name: string; email: string | null },
): SendLinkMessage {
  const signature = [company.legal_name, company.email].filter(Boolean).join('\n');
  return {
    subject: `Votre espace client · ${company.legal_name}`,
    body:
      'Bonjour,\n\nVous pouvez suivre en ligne vos véhicules en cours à l’atelier, vos devis, vos factures ' +
      'et les échéances de contrôle technique et de contrôle hayon de votre flotte :\n\n' +
      `${link}\n\nConservez ce lien, il est mis à jour automatiquement.\n\nCordialement,\n${signature}`,
    sms: `Votre espace client ${company.legal_name} : ${link}`,
  };
}
