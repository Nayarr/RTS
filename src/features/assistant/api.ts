import { invokeFunction } from '@/lib/functions';
import { sendMail } from '@/lib/mail';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import type { InboxEmail } from './mails';

type Tables = Database['public']['Tables'];
export type AgentConversation = Pick<Tables['agent_conversations']['Row'], 'id' | 'title' | 'updated_at'>;
/** Tableau montré par l'agent avec sa réponse (liste à copier ou télécharger). */
export interface AgentTable {
  titre: string;
  colonnes: string[];
  lignes: string[][];
}

export type AgentTurn = Pick<
  Tables['agent_turns']['Row'],
  'id' | 'conversation_id' | 'question' | 'answer' | 'spoken' | 'tools' | 'created_at'
> & { tables: AgentTable[] };

export interface AgentAnswer {
  conversation_id: string;
  turn_id: string | null;
  answer: string;
  /** Actions préparées pendant cette question (à valider). */
  actions?: Pick<AgentAction, 'id' | 'kind' | 'summary'>[];
  tables?: AgentTable[];
}

/**
 * Action préparée par l'agent : rendez-vous (pris, déplacé, annulé), travail, technicien ou date
 * d'un OR, OR à facturer, brouillon de facture, échéance d'un véhicule, mail, mail groupé.
 */
export type AgentAction = Pick<
  Tables['agent_actions']['Row'],
  'id' | 'conversation_id' | 'summary' | 'status' | 'error' | 'created_at'
> & {
  kind:
    | 'appointment'
    | 'ro_work'
    | 'assign_technician'
    | 'send_mail'
    | 'send_mailing'
    | 'vehicle_deadline'
    | 'schedule_order'
    | 'appointment_change'
    | 'order_to_invoice'
    | 'invoice_draft';
  result: { link?: string } | null;
  /** Mail préparé : destinataire, objet et texte relus par la direction avant l'envoi. */
  payload: {
    to?: string;
    subject?: string;
    text?: string;
    client_name?: string | null;
    /** Mail groupé : un mail à chaque client, sans e-mail écartés. */
    recipients?: MailingRecipient[];
    without_email?: number;
  } | null;
};

export interface MailingRecipient {
  client_id: string;
  name: string;
  to: string;
}

/** Mail à relire (seul ou groupé) : valable 24 h, envoyé par la fonction d'envoi des e-mails. */
export const isMailAction = (action: Pick<AgentAction, 'kind'>) =>
  action.kind === 'send_mail' || action.kind === 'send_mailing';

/** Validité d'une action préparée : 30 minutes, 24 h pour un mail (relu à son rythme). */
const ACTION_MINUTES = 30;
const MAIL_HOURS = 24;

/** Actions encore à valider d'une conversation. */
export async function fetchPendingActions(conversationId: string): Promise<AgentAction[]> {
  const { data, error } = await supabase
    .from('agent_actions')
    .select('id, conversation_id, kind, summary, status, result, error, created_at, payload')
    .eq('conversation_id', conversationId)
    .eq('status', 'proposed')
    .gte('created_at', new Date(Date.now() - MAIL_HOURS * 3_600_000).toISOString())
    .order('created_at');
  if (error) throw error;
  const since = Date.now() - ACTION_MINUTES * 60_000;
  return (data as AgentAction[]).filter(
    (action) => isMailAction(action) || new Date(action.created_at).getTime() >= since,
  );
}

/** Mail préparé modifié par la direction avant l'envoi (destinataire, objet, texte). */
export async function editAgentMail(
  id: string,
  mail: { to: string; subject: string; text: string },
): Promise<AgentAction> {
  const { data, error } = await supabase.rpc('edit_agent_mail', {
    p_action_id: id,
    p_to: mail.to,
    p_subject: mail.subject,
    p_text: mail.text,
  });
  if (error) throw error;
  return data as unknown as AgentAction;
}

/** Mail groupé relu par la direction : objet, texte et destinataires gardés (aucun ajouté). */
export async function editAgentMailing(
  id: string,
  mailing: { subject: string; text: string; clientIds: string[] },
): Promise<AgentAction> {
  const { data, error } = await supabase.rpc('edit_agent_mailing', {
    p_action_id: id,
    p_subject: mailing.subject,
    p_text: mailing.text,
    p_client_ids: mailing.clientIds,
  });
  if (error) throw error;
  return data as unknown as AgentAction;
}

/** Exécute une action validée par la direction (droits vérifiés par la base). */
export async function executeAgentAction(id: string): Promise<AgentAction> {
  const { data, error } = await supabase.rpc('execute_agent_action', { p_action_id: id });
  if (error) throw error;
  return data as unknown as AgentAction;
}

/**
 * Envoie un mail préparé par l'agent : la fonction d'envoi relit le mail dans l'action (rien
 * d'autre n'est transmis), le fait partir et marque l'action faite. L'identifiant de l'action sert
 * de clé d'envoi : un nouvel essai n'envoie pas deux fois le mail.
 */
export async function sendAgentMail(action: AgentAction): Promise<AgentAction> {
  await invokeFunction<{ id: string }>('mail-send', {
    agent_action_id: action.id,
    idempotency_key: action.id,
  });
  return { ...action, status: 'done' };
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
    .select('id, conversation_id, question, answer, spoken, tools, tables, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at');
  if (error) throw error;
  return data.map((turn) => ({
    ...turn,
    tables: Array.isArray(turn.tables) ? (turn.tables as unknown as AgentTable[]) : [],
  }));
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
      'id, mailbox, from_name, from_address, subject, body, attachments, received_at, triage_status, category, urgency, summary, needs_reply, handled_at, deadline_updates, deadline_updates_status, clients(name)',
    )
    .order('received_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data;
}

/** Dernier appel de Resend et son résultat (null : aucun mail encore arrivé). */
export async function fetchInboxWebhookStatus() {
  const { data, error } = await supabase.from('inbox_webhook_status').select('*').maybeSingle();
  if (error) throw error;
  return data;
}

/** Dates de contrôle proposées d'après un mail : appliquées aux fiches des véhicules, ou écartées. */
export async function decideDeadlineUpdates(id: string, apply: boolean): Promise<void> {
  const { error } = await supabase.rpc('decide_inbox_deadline_updates', { p_mail_id: id, p_apply: apply });
  if (error) throw error;
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

/** Envoie la réponse préparée telle quelle, depuis la boîte qui a reçu le mail, dans son fil. */
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
