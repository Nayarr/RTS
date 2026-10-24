// Mails reçus triés par l'Agent Direction : libellés, couleurs et filtres de la liste.
import type { Database } from '@/types/database';

export type InboxEmail = Pick<
  Database['public']['Tables']['inbox_emails']['Row'],
  | 'id'
  | 'mailbox'
  | 'from_name'
  | 'from_address'
  | 'subject'
  | 'body'
  | 'attachments'
  | 'received_at'
  | 'triage_status'
  | 'category'
  | 'urgency'
  | 'summary'
  | 'needs_reply'
  | 'handled_at'
> & { clients: { name: string } | null };

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  devis: { label: 'Demande de devis', color: '#137017' },
  rendez_vous: { label: 'Intervention ou rendez-vous', color: '#4750B5' },
  suivi: { label: 'Suivi de réparation', color: '#2A6B52' },
  facturation: { label: 'Facture ou paiement', color: '#C98A00' },
  fournisseur: { label: 'Fournisseur', color: '#7A5AA6' },
  location: { label: 'Location', color: '#2B7A8C' },
  administratif: { label: 'Administratif', color: '#6B7280' },
  publicite: { label: 'Publicité', color: '#9CA3AF' },
  spam: { label: 'Indésirable', color: '#B5453A' },
  autre: { label: 'Autre', color: '#6B7280' },
};

export const URGENCY_META: Record<string, { label: string; color: string }> = {
  urgente: { label: 'Urgent', color: '#B5453A' },
  normale: { label: 'Normal', color: '#C98A00' },
  faible: { label: 'Faible', color: '#9CA3AF' },
};

export const MAIL_FILTERS = [
  { value: 'todo', label: 'À traiter' },
  { value: 'urgent', label: 'Urgents' },
  { value: 'reply', label: 'Réponse attendue' },
  { value: 'handled', label: 'Traités' },
  { value: 'junk', label: 'Publicité et indésirables' },
  { value: 'all', label: 'Tous' },
] as const;
export type MailFilter = (typeof MAIL_FILTERS)[number]['value'];

const isJunk = (mail: InboxEmail) => mail.category === 'publicite' || mail.category === 'spam';

export function matchesMailFilter(mail: InboxEmail, filter: MailFilter): boolean {
  const open = mail.handled_at === null && !isJunk(mail);
  switch (filter) {
    case 'todo':
      return open;
    case 'urgent':
      return open && mail.urgency === 'urgente';
    case 'reply':
      return open && mail.needs_reply === true;
    case 'handled':
      return mail.handled_at !== null;
    case 'junk':
      return isJunk(mail) && mail.handled_at === null;
    case 'all':
      return true;
  }
}

const URGENCY_ORDER: Record<string, number> = { urgente: 0, normale: 1, faible: 2 };

/** À traiter : les urgents d'abord, puis du plus récent au plus ancien. */
export function sortMails(mails: readonly InboxEmail[], filter: MailFilter): InboxEmail[] {
  const byDate = [...mails].sort((a, b) => b.received_at.localeCompare(a.received_at));
  if (filter !== 'todo' && filter !== 'reply') return byDate;
  return byDate.sort(
    (a, b) => (URGENCY_ORDER[a.urgency ?? 'normale'] ?? 1) - (URGENCY_ORDER[b.urgency ?? 'normale'] ?? 1),
  );
}

/** Noms des pièces jointes gardés avec le mail. */
export function attachmentNames(attachments: InboxEmail['attachments']): string[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((file) =>
    file && typeof file === 'object' && 'filename' in file && typeof file.filename === 'string'
      ? [file.filename]
      : [],
  );
}

export type InboxWebhookStatus = Database['public']['Tables']['inbox_webhook_status']['Row'];

/**
 * Dernier appel de Resend, en clair : ce qui s'est passé et quoi faire. Sans appel, la copie des
 * boîtes n'arrive pas jusqu'à l'appli (redirecteur o2switch ou webhook Resend à régler).
 */
export function webhookStatusText(status: InboxWebhookStatus | null): { text: string; problem: boolean } {
  if (!status) {
    return {
      text: 'Aucun mail n’est encore arrivé de Resend. Vérifie le redirecteur de chaque boîte dans cPanel (copie vers l’adresse de réception Resend) et le webhook « email.received » dans Resend.',
      problem: true,
    };
  }
  const domain = status.domain ? `@${status.domain}` : 'du domaine de l’atelier';
  const seen = status.recipients.length ? ` (destinataires : ${status.recipients.join(', ')})` : '';
  const messages: Record<string, { text: string; problem: boolean }> = {
    stored: { text: 'Dernier mail reçu et gardé.', problem: false },
    duplicate: { text: 'Dernier mail déjà reçu par une autre boîte : gardé une seule fois.', problem: false },
    agent_disabled: {
      text: 'Dernier mail ignoré : l’Agent Direction est désactivé dans Réglages › Atelier.',
      problem: true,
    },
    not_atelier: {
      text: `Dernier mail ignoré : il n’est adressé à aucune boîte ${domain}${seen}. Vérifie le domaine d’envoi dans Réglages › Atelier.`,
      problem: true,
    },
    bad_signature: {
      text: 'Dernier appel refusé : signature du webhook invalide. Recopie le secret « whsec_… » de Resend (RESEND_WEBHOOK_SECRET).',
      problem: true,
    },
    bad_event: { text: 'Dernier appel refusé : événement illisible.', problem: true },
    resend_key_missing: {
      text: 'Dernier mail non lu : clé Resend de réception absente (RESEND_RECEIVING_API_KEY).',
      problem: true,
    },
    resend_error: {
      text: 'Dernier mail non lu : Resend a refusé la lecture du contenu (clé sans accès complet ?). Resend le renverra.',
      problem: true,
    },
    error: { text: 'Dernier mail non enregistré : erreur de l’appli, Resend le renverra.', problem: true },
  };
  return messages[status.result] ?? { text: 'Dernier appel de Resend reçu.', problem: false };
}
