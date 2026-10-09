import { invokeFunction } from '@/lib/functions';
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

/** Point du jour : résumé de la situation de l'atelier, fait une fois par jour. */
export interface AgentBriefing {
  day: string;
  text: string;
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
