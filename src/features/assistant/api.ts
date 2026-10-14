import { invokeFunction } from '@/lib/functions';
import { sendMail } from '@/lib/mail';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { InboxEmail } from './mails';

type Tables = Database['public']['Tables'];
export type AgentConversation = Pick<Tables['agent_conversations']['Row'], 'id' | 'title' | 'updated_at'>;
export type AgentTurn = Pick<
  Tables['agent_turns']['Row'],
  'id' | 'conversation_id' | 'question' | 'answer' | 'spoken' | 'tools' | 'created_at'
>;

export interface AgentAnswer {
  conversation_id: string;
  turn_id: string | null;
  answer: string;
  /** Actions préparées pendant cette question (à valider). */
  actions?: Pick<AgentAction, 'id' | 'kind' | 'summary'>[];
}

/** Action préparée par l'agent (rendez-vous, travail sur un OR, technicien assigné). */
export type AgentAction = Pick<
  Tables['agent_actions']['Row'],
  'id' | 'conversation_id' | 'summary' | 'status' | 'error' | 'created_at'
> & {
  kind: 'appointment' | 'ro_work' | 'assign_technician';
  result: { link?: string } | null;
};

/** Actions encore à valider d'une conversation (30 minutes au plus). */
export async function fetchPendingActions(conversationId: string): Promise<AgentAction[]> {
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, conversation_id, kind, summary, status, result, error, created_at')
    .eq('conversation_id', conversationId)
    .eq('status', 'proposed')
    .gte('created_at', new Date(Date.now() - 30 * 60_000).toISOString())
    .order('created_at');
  if (error) throw error;
  return data as AgentAction[];
}

/** Exécute une action validée par la direction (droits vérifiés par la base). */
export async function executeAgentAction(id: string): Promise<AgentAction> {
  const { data, error } = await supabase.rpc('execute_agent_action', { p_action_id: id });
  if (error) throw error;
  return data as unknown as AgentAction;
}

export async function cancelAgentAction(id: string) {
  const { error } = await supabase.rpc('cancel_agent_action', { p_action_id: id });
  if (error) throw error;
}

/** Pose une question à l'assistant (nouvelle conversation si `conversationId` est absent). */
export function askAgent(input: {
  conversationId?: string;
  question: string;
  spoken: boolean;
  /** Autres versions entendues par la dictée, pour corriger un mot mal compris. */
  alternatives?: string[];
}) {
  return invokeFunction<AgentAnswer>('agent', {
    ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
    question: input.question,
    spoken: input.spoken,
    ...(input.alternatives?.length ? { alternatives: input.alternatives.slice(0, 3) } : {}),
  });
}

/** Phrase du point du jour : étiquette (« Urgent », « Paiements »…), texte lu, urgence. */
export interface BriefingPhrase {
  etiquette: string;
  texte: string;
  urgent: boolean;
}

/** Point du jour : résumé de la situation de l'atelier, fait une fois par jour. */
export interface AgentBriefing {
  day: string;
  text: string;
  /** Phrases lues une par une (vide pour un point fait avant le découpage en phrases). */
  phrases: BriefingPhrase[];
  tools: string[];
  updated_at: string;
}

/** Point du jour (gardé pour la journée) ; `refresh` le refait avec les données du moment. */
export async function fetchBriefing(refresh = false): Promise<AgentBriefing> {
  const result = await invokeFunction<{ briefing: AgentBriefing }>('agent', {
    briefing: true,
    ...(refresh ? { refresh: true } : {}),
  });
  return result.briefing;
}

/** Conversations récentes de la personne connectée. */
export async function fetchConversations(): Promise<AgentConversation[]> {
  const { data, error } = await supabase
    .from('agent_conversations')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data;
}

/** Questions et réponses d'une conversation, dans l'ordre. */
export async function fetchTurns(conversationId: string): Promise<AgentTurn[]> {
  const { data, error } = await supabase
    .from('agent_turns')
    .select('id, conversation_id, question, answer, spoken, tools, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) throw error;
  return data;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('agent_conversations').delete().eq('id', id);
  if (error) throw error;
}

/** Mails reçus des 90 derniers jours (copies gardées par l'appli), les plus récents d'abord. */
export async function fetchInboxEmails(): Promise<InboxEmail[]> {
  const { data, error } = await supabase
    .from('inbox_emails')
    .select(
      'id, mailbox, from_name, from_address, subject, body, attachments, received_at, triage_status, category, urgency, summary, needs_reply, handled_at, clients(name)',
    )
    .order('received_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data;
}

/** Marque des mails traités (ou les remet à traiter). */
export async function setMailsHandled(ids: string[], handled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_inbox_emails_handled', { p_ids: ids, p_handled: handled });
  if (error) throw error;
}

/** Mails à traiter (hors publicité et indésirables), pour le bouton de l'Agent Direction. */
export async function countMailsToHandle(): Promise<number> {
  const { count, error } = await supabase
    .from('inbox_emails')
    .select('id', { count: 'exact', head: true })
    .is('handled_at', null)
    .or('category.is.null,category.not.in.(publicite,spam)');
  if (error) throw error;
  return count ?? 0;
}

/** Mail reçu avec la réponse préparée par l'Agent Direction. */
export type PreparedReply = Pick<
  Tables['inbox_emails']['Row'],
  | 'id'
  | 'mailbox'
  | 'from_name'
  | 'from_address'
  | 'subject'
  | 'received_at'
  | 'category'
  | 'urgency'
  | 'summary'
  | 'reply_status'
  | 'reply_request'
  | 'reply_subject'
  | 'reply_body'
  | 'reply_basis'
  | 'reply_sent_at'
> & { clients: { name: string } | null };

/** Début de la journée (heure de l'appareil), pour les réponses envoyées aujourd'hui. */
const startOfToday = () => {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  return day;
};

/**
 * Réponses préparées du point du jour : à relire ou remises à plus tard (mails de la semaine pas
 * encore traités), et celles envoyées aujourd'hui. Urgents d'abord, puis du plus ancien au plus récent.
 */
export async function fetchPreparedReplies(): Promise<PreparedReply[]> {
  const { data, error } = await supabase
    .from('inbox_emails')
    .select(
      'id, mailbox, from_name, from_address, subject, received_at, category, urgency, summary, reply_status, reply_request, reply_subject, reply_body, reply_basis, reply_sent_at, handled_at, clients(name)',
    )
    .in('reply_status', ['ready', 'postponed', 'sent'])
    .gte('received_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('received_at')
    .limit(40);
  if (error) throw error;
  const today = startOfToday().getTime();
  return data
    .filter((mail) =>
      mail.reply_status === 'sent'
        ? Boolean(mail.reply_sent_at && new Date(mail.reply_sent_at).getTime() >= today)
        : mail.handled_at === null,
    )
    .sort((a, b) => Number(b.urgency === 'urgente') - Number(a.urgency === 'urgente'))
    .map(({ handled_at: _handled, ...mail }) => mail);
}

/** « Plus tard » : la réponse reste à relire, elle n'est plus lue dans le point. */
export async function postponeReply(id: string): Promise<void> {
  const { error } = await supabase.rpc('postpone_inbox_reply', { p_id: id });
  if (error) throw error;
}

/** Envoie la réponse préparée telle quelle, depuis atelier@, dans le fil du mail reçu. */
export function sendPreparedReply(reply: PreparedReply) {
  return sendMail({
    category: 'workshop',
    to: reply.from_address,
    subject: reply.reply_subject ?? `Re: ${reply.subject}`,
    text: reply.reply_body ?? '',
    attachments: [],
    // Même clé pour un nouvel essai : le client ne reçoit jamais deux fois la réponse
    idempotencyKey: reply.id,
    inboxEmailId: reply.id,
  });
}
