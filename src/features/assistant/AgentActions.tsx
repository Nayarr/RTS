import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Receipt,
  Send,
  UserCheck,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UNDO_SECONDS } from './agent-actions';
import {
  cancelAgentAction,
  editAgentMail,
  editAgentMailing,
  executeAgentAction,
  isMailAction,
  sendAgentMail,
  type AgentAction,
} from './api';

const ICONS: Record<AgentAction['kind'], LucideIcon> = {
  appointment: CalendarPlus,
  ro_work: Wrench,
  assign_technician: UserCheck,
  send_mail: Mail,
  send_mailing: Users,
  vehicle_deadline: CalendarClock,
  schedule_order: CalendarRange,
  appointment_change: CalendarClock,
  order_to_invoice: Receipt,
  invoice_draft: FileText,
};

/** Poignée de la page : « vas-y » à la voix valide la première action en attente. */
export interface AgentActionsHandle {
  validateFirst: () => void;
}

interface MailDraft {
  to: string;
  subject: string;
  text: string;
}

const draftOf = (action: AgentAction): MailDraft => ({
  to: action.payload?.to ?? '',
  subject: action.payload?.subject ?? '',
  text: action.payload?.text ?? '',
});

/**
 * Actions préparées par l'Agent Direction : rien ne s'exécute avant « Valider » (ou « vas-y » à
 * la voix), puis 5 secondes pour annuler. Les mails se relisent un par un, modifiables avant
 * « Envoyer ».
 */
export function AgentActions({
  actions,
  ref,
  onValidated,
}: {
  actions: AgentAction[];
  ref?: Ref<AgentActionsHandle>;
  onValidated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [counting, setCounting] = useState<{ id: string; left: number } | null>(null);
  const [mailIndex, setMailIndex] = useState(0);
  const timer = useRef<number | null>(null);

  const mails = actions.filter((action) => action.kind === 'send_mail');
  const mailings = actions.filter((action) => action.kind === 'send_mailing');
  const others = actions.filter((action) => !isMailAction(action));
  const currentMail = mails[Math.min(mailIndex, mails.length - 1)];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agent', 'actions'] });
  const execute = useMutation({
    // Un mail part par la fonction d'envoi ; les autres actions par la base
    mutationFn: (action: AgentAction) =>
      isMailAction(action) ? sendAgentMail(action) : executeAgentAction(action.id),
    onSuccess: (action) => {
      if (action.status === 'done') toast.success(`Fait : ${action.summary}`);
      else toast.error(action.error ? `Non fait : ${action.error}` : 'Action non faite');
      onValidated?.();
      return refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Action non faite'),
  });
  const cancel = useMutation({ mutationFn: cancelAgentAction, onSuccess: refresh });
  const edit = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: MailDraft }) => editAgentMail(id, draft),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Mail non modifié'),
  });

  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setCounting(null);
  };
  useEffect(() => stop, []);

  const validate = (action: AgentAction) => {
    stop();
    setCounting({ id: action.id, left: UNDO_SECONDS });
    timer.current = window.setInterval(() => {
      setCounting((current) => {
        if (!current) return null;
        if (current.left <= 1) {
          if (timer.current !== null) window.clearInterval(timer.current);
          timer.current = null;
          execute.mutate(action);
          return null;
        }
        return { ...current, left: current.left - 1 };
      });
    }, 1000);
  };

  /** Mail relu : modifications enregistrées, puis envoi dans 5 s (annulable). */
  const sendMail = async (action: AgentAction, draft: MailDraft) => {
    const saved = draftOf(action);
    if (draft.to !== saved.to || draft.subject !== saved.subject || draft.text !== saved.text) {
      const updated = await edit.mutateAsync({ id: action.id, draft }).catch(() => null);
      if (!updated) return;
    }
    validate(action);
  };

  /** Mail groupé relu : modifications enregistrées, puis envoi dans 5 s (annulable). */
  const sendMailing = async (action: AgentAction, draft: MailingDraft) => {
    const saved = mailingDraftOf(action);
    if (
      draft.subject !== saved.subject ||
      draft.text !== saved.text ||
      draft.clientIds.length !== saved.clientIds.length
    ) {
      const updated = await editAgentMailing(action.id, draft).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Mail groupé non modifié');
        return null;
      });
      if (!updated) return;
    }
    validate(action);
  };

  // « Vas-y » à la voix : la première action en attente (ou le mail affiché, tel quel) est validée
  useImperativeHandle(ref, () => ({
    validateFirst: () => {
      const first = others[0] ?? currentMail;
      if (first && !counting) validate(first);
    },
  }));

  if (actions.length === 0) return null;
  return (
    <div className="col gap-2.5">
      {others.length > 0 && (
        <ul className="col gap-2.5" aria-label="Actions préparées">
          {others.map((action) => {
            const Icon = ICONS[action.kind];
            const isCounting = counting?.id === action.id;
            return (
              <li key={action.id} className="card row flex-wrap gap-3 px-4 py-3">
                <Icon className="i shrink-0" />
                <span className="col grow gap-0.5">
                  <b className="text-sm">{action.summary}</b>
                  <span className="hint">
                    {isCounting
                      ? `Exécution dans ${counting.left} s`
                      : 'Préparée par l’agent : rien n’est fait avant ta validation.'}
                  </span>
                </span>
                {isCounting ? (
                  <Button size="sm" variant="outline" onClick={stop}>
                    <X /> Annuler
                  </Button>
                ) : (
                  <span className="row gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancel.isPending || execute.isPending}
                      onClick={() => cancel.mutate(action.id)}
                    >
                      <X /> Ne pas faire
                    </Button>
                    <Button
                      size="sm"
                      disabled={execute.isPending || counting !== null}
                      onClick={() => validate(action)}
                    >
                      <Check /> Valider
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mailings.map((mailing) => (
        <section key={mailing.id} className="card col gap-3 px-4 py-3.5" aria-label="Mail groupé">
          <div className="row flex-wrap items-center gap-2">
            <Users className="i shrink-0" />
            <b className="grow text-sm">{mailing.summary}</b>
          </div>
          <MailingEditor
            mailing={mailing}
            locked={counting !== null || execute.isPending}
            counting={counting?.id === mailing.id ? counting.left : null}
            onSend={(draft) => void sendMailing(mailing, draft)}
            onSkip={() => cancel.mutate(mailing.id)}
            onUndo={stop}
          />
        </section>
      ))}

      {currentMail && (
        <section className="card col gap-3 px-4 py-3.5" aria-label="Mails préparés">
          <div className="row flex-wrap items-center gap-2">
            <Mail className="i shrink-0" />
            <b className="grow text-sm">
              {mails.length > 1
                ? `Mail ${mails.indexOf(currentMail) + 1} sur ${mails.length}`
                : 'Mail préparé'}
              {currentMail.payload?.client_name ? ` · ${currentMail.payload.client_name}` : ''}
            </b>
            {mails.length > 1 && (
              <span className="row gap-1">
                <button
                  type="button"
                  className="ibtn sm ghost"
                  aria-label="Mail précédent"
                  disabled={mails.indexOf(currentMail) === 0 || counting !== null}
                  onClick={() => setMailIndex(mails.indexOf(currentMail) - 1)}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  className="ibtn sm ghost"
                  aria-label="Mail suivant"
                  disabled={mails.indexOf(currentMail) === mails.length - 1 || counting !== null}
                  onClick={() => setMailIndex(mails.indexOf(currentMail) + 1)}
                >
                  <ChevronRight className="size-4" />
                </button>
              </span>
            )}
          </div>
          <MailEditor
            key={currentMail.id}
            mail={currentMail}
            locked={counting !== null || execute.isPending}
            counting={counting?.id === currentMail.id ? counting.left : null}
            saving={edit.isPending}
            onSend={(draft) => void sendMail(currentMail, draft)}
            onSkip={() => cancel.mutate(currentMail.id)}
            onUndo={stop}
          />
        </section>
      )}
    </div>
  );
}

/** Un mail préparé : destinataire, objet et texte modifiables, puis envoyé ou écarté. */
function MailEditor({
  mail,
  locked,
  counting,
  saving,
  onSend,
  onSkip,
  onUndo,
}: {
  mail: AgentAction;
  locked: boolean;
  counting: number | null;
  saving: boolean;
  onSend: (draft: MailDraft) => void;
  onSkip: () => void;
  onUndo: () => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(mail));
  const id = mail.id.slice(0, 8);
  const set = (field: keyof MailDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));
  const empty = !draft.to.trim() || !draft.subject.trim() || !draft.text.trim();

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="field">
          <Label htmlFor={`mail-to-${id}`}>À</Label>
          <Input id={`mail-to-${id}`} type="email" value={draft.to} disabled={locked} onChange={set('to')} />
        </div>
        <div className="field">
          <Label htmlFor={`mail-subject-${id}`}>Objet</Label>
          <Input
            id={`mail-subject-${id}`}
            value={draft.subject}
            maxLength={200}
            disabled={locked}
            onChange={set('subject')}
          />
        </div>
      </div>
      <div className="field">
        <Label htmlFor={`mail-text-${id}`}>Texte</Label>
        <Textarea
          id={`mail-text-${id}`}
          rows={8}
          value={draft.text}
          maxLength={5000}
          disabled={locked}
          onChange={set('text')}
        />
      </div>
      <div className="row flex-wrap items-center gap-2">
        <span className="hint grow">
          {counting !== null
            ? `Envoi dans ${counting} s`
            : 'Préparé par l’agent : rien ne part avant « Envoyer ».'}
        </span>
        {counting !== null ? (
          <Button size="sm" variant="outline" onClick={onUndo}>
            <X /> Annuler
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={locked} onClick={onSkip}>
              <X /> Ne pas envoyer
            </Button>
            <Button size="sm" disabled={locked || saving || empty} onClick={() => onSend(draft)}>
              <Send /> Envoyer
            </Button>
          </>
        )}
      </div>
    </>
  );
}

interface MailingDraft {
  subject: string;
  text: string;
  clientIds: string[];
}

const mailingDraftOf = (action: AgentAction): MailingDraft => ({
  subject: action.payload?.subject ?? '',
  text: action.payload?.text ?? '',
  clientIds: (action.payload?.recipients ?? []).map((recipient) => recipient.client_id),
});

/**
 * Mail groupé : objet et texte modifiables ({client} remplacé par le nom de chaque client), liste
 * des destinataires à décocher. Chacun reçoit son propre mail.
 */
function MailingEditor({
  mailing,
  locked,
  counting,
  onSend,
  onSkip,
  onUndo,
}: {
  mailing: AgentAction;
  locked: boolean;
  counting: number | null;
  onSend: (draft: MailingDraft) => void;
  onSkip: () => void;
  onUndo: () => void;
}) {
  const [draft, setDraft] = useState(() => mailingDraftOf(mailing));
  const recipients = mailing.payload?.recipients ?? [];
  const withoutEmail = mailing.payload?.without_email ?? 0;
  const id = mailing.id.slice(0, 8);
  const kept = new Set(draft.clientIds);
  const toggle = (clientId: string) =>
    setDraft((current) => ({
      ...current,
      clientIds: current.clientIds.includes(clientId)
        ? current.clientIds.filter((value) => value !== clientId)
        : recipients
            .map((r) => r.client_id)
            .filter((value) => value === clientId || current.clientIds.includes(value)),
    }));
  const count = draft.clientIds.length;
  const empty = !draft.subject.trim() || !draft.text.trim() || count === 0;

  return (
    <>
      <div className="field">
        <Label htmlFor={`mailing-subject-${id}`}>Objet</Label>
        <Input
          id={`mailing-subject-${id}`}
          value={draft.subject}
          maxLength={200}
          disabled={locked}
          onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
        />
      </div>
      <div className="field">
        <Label htmlFor={`mailing-text-${id}`}>Texte</Label>
        <Textarea
          id={`mailing-text-${id}`}
          rows={8}
          value={draft.text}
          maxLength={5000}
          disabled={locked}
          onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))}
        />
        <span className="hint">{'{client}'} est remplacé par le nom de chaque client.</span>
      </div>
      <details className="col gap-2">
        <summary className="cursor-pointer text-sm font-semibold">
          Destinataires : {count} sur {recipients.length}
          {withoutEmail > 0 ? ` (${withoutEmail} sans e-mail, écarté${withoutEmail > 1 ? 's' : ''})` : ''}
        </summary>
        <ul className="col mt-2 max-h-64 gap-1 overflow-y-auto" aria-label="Destinataires du mail groupé">
          {recipients.map((recipient) => (
            <li key={recipient.client_id}>
              <label className="row gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={kept.has(recipient.client_id)}
                  disabled={locked}
                  onChange={() => toggle(recipient.client_id)}
                />
                <span className="grow">{recipient.name}</span>
                <span className="muted">{recipient.to}</span>
              </label>
            </li>
          ))}
        </ul>
      </details>
      <div className="row flex-wrap items-center gap-2">
        <span className="hint grow">
          {counting !== null
            ? `Envoi dans ${counting} s`
            : 'Un mail à chaque client, son adresse seule. Rien ne part avant « Envoyer ».'}
        </span>
        {counting !== null ? (
          <Button size="sm" variant="outline" onClick={onUndo}>
            <X /> Annuler
          </Button>
        ) : (
          <>
            <Button size="sm" variant="outline" disabled={locked} onClick={onSkip}>
              <X /> Ne pas envoyer
            </Button>
            <Button size="sm" disabled={locked || empty} onClick={() => onSend(draft)}>
              <Send /> Envoyer à {count} client{count > 1 ? 's' : ''}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
