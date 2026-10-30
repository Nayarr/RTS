import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Check, ChevronDown, Paperclip, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ListControls';
import { cn } from '@/lib/utils';
import { decideDeadlineUpdates, fetchInboxEmails, fetchInboxWebhookStatus, setMailsHandled } from './api';
import {
  attachmentNames,
  CATEGORY_META,
  deadlineUpdateLine,
  deadlineUpdates,
  MAIL_FILTERS,
  matchesMailFilter,
  sortMails,
  URGENCY_META,
  webhookStatusText,
  type InboxEmail,
  type MailFilter,
} from './mails';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** « 08:12 » aujourd'hui, « mar. 6 oct. » avant. */
function receivedLabel(iso: string): string {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? TIME.format(date) : DAY.format(date);
}

/** Mails reçus par les boîtes de l'atelier, triés par l'Agent Direction. */
export function MailsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<MailFilter>('todo');
  const [openId, setOpenId] = useState<string | null>(null);
  const mails = useQuery({
    queryKey: ['agent', 'mails'],
    queryFn: fetchInboxEmails,
    refetchInterval: 2 * 60_000,
  });
  const webhook = useQuery({
    queryKey: ['agent', 'mails', 'webhook'],
    queryFn: fetchInboxWebhookStatus,
    refetchInterval: 2 * 60_000,
  });
  const reception = webhook.isSuccess ? webhookStatusText(webhook.data) : null;

  const handle = useMutation({
    mutationFn: ({ ids, handled }: { ids: string[]; handled: boolean }) => setMailsHandled(ids, handled),
    onSuccess: (_, { handled }) => {
      void queryClient.invalidateQueries({ queryKey: ['agent', 'mails'] });
      toast.success(handled ? 'Mail rangé dans « Traités »' : 'Mail remis à traiter');
    },
    onError: () => toast.error('Mail non modifié : réessaie'),
  });

  const all = useMemo(() => mails.data ?? [], [mails.data]);
  const list = useMemo(
    () =>
      sortMails(
        all.filter((mail) => matchesMailFilter(mail, filter)),
        filter,
      ),
    [all, filter],
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Agent Direction', to: '/agent-direction' }, { label: 'Mails reçus' }]}
        title="Mails reçus"
        actions={
          <span className="sub hidden md:inline">
            Copies des boîtes de l’atelier, triées par l’agent. Les mails restent dans ta messagerie.
          </span>
        }
      />

      <FilterChips
        label="Filtrer les mails"
        value={filter}
        onChange={(value) => {
          setFilter(value);
          setOpenId(null);
        }}
        options={MAIL_FILTERS.map(({ value, label }) => ({
          value,
          label,
          count: all.filter((mail) => matchesMailFilter(mail, value)).length,
          ...(value === 'urgent' ? { color: URGENCY_META.urgente?.color } : {}),
        }))}
      />

      {mails.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {mails.isError && <p className="text-destructive">Impossible de charger les mails.</p>}
      {mails.isSuccess && all.length === 0 && (
        <p className="empty">
          Aucun mail reçu pour l’instant. Les copies arrivent dès que les boîtes de l’atelier les renvoient à
          l’appli.
        </p>
      )}
      {reception && (reception.problem || all.length === 0) && (
        <p role="status" className={cn('hint', reception.problem && 'text-destructive')}>
          {webhook.data && <span className="num">{receivedLabel(webhook.data.received_at)} · </span>}
          {reception.text}
        </p>
      )}
      {mails.isSuccess && all.length > 0 && list.length === 0 && (
        <p className="empty">{filter === 'todo' ? 'Tout est traité.' : 'Aucun mail dans cette catégorie.'}</p>
      )}

      {list.length > 0 && (
        <ul className="card mail-list" aria-label="Mails">
          {list.map((mail) => (
            <MailRow
              key={mail.id}
              mail={mail}
              open={openId === mail.id}
              pending={handle.isPending}
              onToggle={() => setOpenId(openId === mail.id ? null : mail.id)}
              onHandled={(handled) => handle.mutate({ ids: [mail.id], handled })}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function MailRow({
  mail,
  open,
  pending,
  onToggle,
  onHandled,
}: {
  mail: InboxEmail;
  open: boolean;
  pending: boolean;
  onToggle: () => void;
  onHandled: (handled: boolean) => void;
}) {
  const category = mail.category ? CATEGORY_META[mail.category] : undefined;
  const urgency = mail.urgency ? URGENCY_META[mail.urgency] : undefined;
  const files = attachmentNames(mail.attachments);
  const sender = mail.from_name || mail.from_address;
  const bodyId = `mail-${mail.id}`;

  return (
    <li className={cn('mail-row', mail.handled_at && 'done')}>
      <span
        className="mail-dot"
        style={{ '--c': urgency?.color ?? '#9CA3AF' } as CSSProperties}
        aria-label={urgency ? `Urgence : ${urgency.label.toLowerCase()}` : 'Pas encore trié'}
        role="img"
      />
      <div className="mail-main">
        <button
          type="button"
          className="mail-head"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="mail-from">
            <b className="truncate">{sender}</b>
            {mail.clients && <span className="mail-client">client : {mail.clients.name}</span>}
            <time className="mail-time" dateTime={mail.received_at}>
              {receivedLabel(mail.received_at)}
            </time>
          </span>
          <span className="mail-subject">{mail.subject || '(sans objet)'}</span>
          <span className="mail-summary">
            {mail.summary ??
              (mail.triage_status === 'pending' ? 'Tri en cours…' : 'Pas trié : ouvre le mail pour le lire.')}
          </span>
          <span className="mail-tags">
            {category && (
              <span className="badge" style={{ '--c': category.color } as CSSProperties}>
                {category.label}
              </span>
            )}
            {mail.needs_reply && !mail.handled_at && <span className="tag">Réponse attendue</span>}
            {mail.deadline_updates_status === 'proposed' && (
              <span className="tag">
                <CalendarCheck className="size-3" /> Échéance à mettre à jour
              </span>
            )}
            {files.length > 0 && (
              <span className="tag">
                <Paperclip className="size-3" />{' '}
                {files.length === 1 ? '1 pièce jointe' : `${files.length} pièces jointes`}
              </span>
            )}
            <ChevronDown className={cn('mail-chev size-4', open && 'up')} aria-hidden />
          </span>
        </button>
        {open && (
          <div className="mail-body" id={bodyId}>
            <p className="hint">
              De {mail.from_name ? `${mail.from_name} <${mail.from_address}>` : mail.from_address}
              {mail.mailbox && ` · reçu sur ${mail.mailbox}`}
              {files.length > 0 && ` · pièces jointes : ${files.join(', ')}`}
            </p>
            <DeadlineUpdates mail={mail} />
            <p className="mail-text">{mail.body || '(mail vide)'}</p>
          </div>
        )}
      </div>
      {mail.handled_at ? (
        <button
          type="button"
          className="ibtn sm ghost"
          aria-label={`Remettre à traiter : ${mail.subject || sender}`}
          title="Remettre à traiter"
          disabled={pending}
          onClick={() => onHandled(false)}
        >
          <RotateCcw className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          className="ibtn sm"
          aria-label={`Marquer traité : ${mail.subject || sender}`}
          title="Marquer traité"
          disabled={pending}
          onClick={() => onHandled(true)}
        >
          <Check className="size-4" />
        </button>
      )}
    </li>
  );
}

/**
 * Contrôle technique ou hayon renouvelé annoncé dans le mail : nouvelles dates proposées pour les
 * fiches des véhicules (cohérentes, vérifiées par la base), appliquées ou écartées par le bureau.
 */
function DeadlineUpdates({ mail }: { mail: InboxEmail }) {
  const queryClient = useQueryClient();
  const updates = deadlineUpdates(mail.deadline_updates);
  const decide = useMutation({
    mutationFn: (apply: boolean) => decideDeadlineUpdates(mail.id, apply),
    onSuccess: (_, apply) => {
      void queryClient.invalidateQueries({ queryKey: ['agent', 'mails'] });
      void queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success(apply ? 'Fiches des véhicules mises à jour' : 'Mise à jour écartée');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Réessaie'),
  });
  if (updates.length === 0 || mail.deadline_updates_status === 'none') return null;
  const proposed = mail.deadline_updates_status === 'proposed';
  return (
    <section className="alert s-blue col items-start gap-2" aria-label="Échéances proposées">
      <span className="row gap-2">
        <CalendarCheck className="i" />
        <b>
          {proposed
            ? 'Mettre à jour la fiche du véhicule ?'
            : mail.deadline_updates_status === 'applied'
              ? 'Fiche du véhicule mise à jour'
              : 'Mise à jour écartée'}
        </b>
      </span>
      <ul className="col gap-0.5">
        {updates.map((update) => (
          <li key={`${update.vehicle_id}-${update.kind}`}>{deadlineUpdateLine(update)}</li>
        ))}
      </ul>
      {proposed && (
        <div className="row flex-wrap gap-2">
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
            Mettre à jour
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={decide.isPending}
            onClick={() => decide.mutate(false)}
          >
            Ignorer
          </Button>
        </div>
      )}
    </section>
  );
}
