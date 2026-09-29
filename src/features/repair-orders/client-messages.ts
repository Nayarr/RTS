import type { SendLinkMessage } from '@/lib/send-links';
import { supabase } from '@/lib/supabase';
import type { Enums } from '@/types/database';
import type { RepairOrderStatus } from './constants';

export type ClientMessageType = Extract<
  Enums<'client_message_type'>,
  'vehicle_received' | 'quote_available' | 'vehicle_ready'
>;

/** Messages proposés sur l'OR, dans l'ordre de l'ancienne appli. */
export const CLIENT_MESSAGE_LABELS: Record<ClientMessageType, string> = {
  vehicle_received: 'Véhicule pris en charge',
  quote_available: 'Devis disponible',
  vehicle_ready: 'Véhicule prêt',
};
export const CLIENT_MESSAGE_TYPES = Object.keys(CLIENT_MESSAGE_LABELS) as ClientMessageType[];

export interface SentClientMessage {
  message_type: Enums<'client_message_type'>;
  channel: Enums<'message_channel'>;
  sent_at: string;
}

/** Message conseillé selon l'avancement de l'OR (jamais un message déjà envoyé). */
export function suggestedMessage(
  status: RepairOrderStatus,
  hasSentQuote: boolean,
  sent: SentClientMessage[],
): ClientMessageType | null {
  const alreadySent = (type: ClientMessageType) => sent.some((message) => message.message_type === type);
  if (['work_done', 'to_invoice', 'invoiced'].includes(status) && !alreadySent('vehicle_ready')) {
    return 'vehicle_ready';
  }
  if (hasSentQuote && !alreadySent('quote_available')) return 'quote_available';
  if (['assigned', 'in_progress'].includes(status) && !alreadySent('vehicle_received')) {
    return 'vehicle_received';
  }
  return null;
}

interface MessageCompany {
  legal_name: string;
  address_line: string;
  postal_code: string;
  city: string;
  email: string | null;
}

/** Textes de l'ancienne appli, signés avec les coordonnées des Réglages. */
export function clientMessage(
  type: ClientMessageType,
  { plate, quoteLink }: { plate: string; quoteLink: string | null },
  company: MessageCompany,
): SendLinkMessage {
  const address = `${company.address_line}, ${company.postal_code} ${company.city}`;
  const signature = [company.legal_name, company.email].filter(Boolean).join('\n');
  const text = {
    vehicle_received:
      `Nous vous confirmons la prise en charge de votre véhicule ${plate} dans notre atelier. ` +
      'Nous revenons vers vous dès que le diagnostic est établi.',
    quote_available:
      `Le devis pour votre véhicule ${plate} est disponible${quoteLink ? ` ici : ${quoteLink}` : '.'}\n` +
      'Vous pouvez le consulter et l’accepter en ligne.',
    vehicle_ready:
      `Votre véhicule ${plate} est prêt, vous pouvez venir le récupérer à l’atelier (${address}) ` +
      'aux heures d’ouverture.',
  }[type];
  const body = `Bonjour,\n\n${text}\n\nCordialement,\n${signature}`;
  return {
    subject: `${CLIENT_MESSAGE_LABELS[type]} — ${plate} — ${company.legal_name}`,
    body,
    sms: body.replace(/\n+/g, ' '),
  };
}

export async function fetchSentClientMessages(repairOrderId: string): Promise<SentClientMessage[]> {
  const { data, error } = await supabase
    .from('client_messages')
    .select('message_type, channel, sent_at')
    .eq('repair_order_id', repairOrderId)
    .order('sent_at');
  if (error) throw error;
  return data;
}

/** Trace l'envoi (la base l'ajoute à l'historique de l'OR). */
export async function recordClientMessage(input: {
  repairOrderId: string;
  type: ClientMessageType;
  channel: 'email' | 'sms';
  recipient: string | null;
  message: SendLinkMessage;
}) {
  const { error } = await supabase.from('client_messages').insert({
    repair_order_id: input.repairOrderId,
    message_type: input.type,
    channel: input.channel,
    recipient: input.recipient,
    subject: input.channel === 'email' ? input.message.subject : null,
    body: input.channel === 'email' ? input.message.body : input.message.sms,
  });
  if (error) throw error;
}
