import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Check, Mail, UserCheck, Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { UNDO_SECONDS } from './agent-actions';
import { cancelAgentAction, executeAgentAction, sendAgentMail, type AgentAction } from './api';

const ICONS = {
  appointment: CalendarPlus,
  ro_work: Wrench,
  assign_technician: UserCheck,
  send_mail: Mail,
} as const;

/**
 * Actions préparées par l'Agent Direction : rien ne s'exécute avant « Valider » (ou « vas-y » à
 * la voix), puis 5 secondes pour annuler.
 */
/** Poignée de la page : « vas-y » à la voix valide la première action en attente. */
export interface AgentActionsHandle {
  validateFirst: () => void;
}

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
  const timer = useRef<number | null>(null);

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
          const target = actions.find((item) => item.id === current.id);
          if (target) execute.mutate(target);
          return null;
        }
        return { ...current, left: current.left - 1 };
      });
    }, 1000);
  };

  // « Vas-y » à la voix : la première action en attente est validée
  useImperativeHandle(ref, () => ({
    validateFirst: () => {
      const first = actions[0];
      if (first && !counting) validate(first);
    },
  }));

  if (actions.length === 0) return null;
  return (
    <ul className="col gap-2.5" aria-label="Actions préparées">
      {actions.map((action) => {
        const Icon = ICONS[action.kind];
        const isCounting = counting?.id === action.id;
        return (
          <li key={action.id} className="card row flex-wrap gap-3 px-4 py-3">
            <Icon className="i shrink-0" />
            <span className="col grow gap-0.5">
              <b className="text-sm">{action.summary}</b>
              {action.kind === 'send_mail' && action.payload && (
                <details className="text-sm">
                  <summary className="hint cursor-pointer">Lire le mail</summary>
                  <p className="hint mt-1">
                    À : {action.payload.to} · Objet : {action.payload.subject}
                  </p>
                  <p className="mt-1 whitespace-pre-line">{action.payload.text}</p>
                </details>
              )}
              <span className="hint">
                {isCounting
                  ? `${action.kind === 'send_mail' ? 'Envoi' : 'Exécution'} dans ${counting.left} s`
                  : action.kind === 'send_mail'
                    ? 'Préparé par l’agent : rien ne part avant ta validation.'
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
  );
}
