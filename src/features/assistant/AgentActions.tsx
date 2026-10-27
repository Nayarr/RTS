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
import { cancelAgentAction, editAgentMail, executeAgentAction, sendAgentMail, type AgentAction } from './api';

const ICONS: Record<AgentAction['kind'], LucideIcon> = {
  appointment: CalendarPlus,
  ro_work: Wrench,
  assign_technician: UserCheck,
  send_mail: Mail,
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
  const others = actions.filter((action) => action.kind !== 'send_mail');
  const currentMail = mails[Math.min(mailIndex, mails.length - 1)];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['agent', 'actions'] });
  const execute = useMutation({
    // Un mail part par la fonction d'envoi ; les autres actions par la base
    mutationFn: (action: AgentAction) =>
      action.kind === 'send_mail' ? sendAgentMail(action) : executeAgentAction(action.id),
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
