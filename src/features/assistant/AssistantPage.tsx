import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  History,
  Keyboard,
  Mic,
  MicOff,
  Plus,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDictation } from '@/lib/use-dictation';
import { cn } from '@/lib/utils';
import { askAgent, deleteConversation, fetchConversations, fetchTurns, type AgentTurn } from './api';
import type { OrbState } from './orb-mesh';
import { saveVoicePreference, speak, speechSupported, stopSpeaking, voicePreference } from './speech';
import { sourcesLabel, SUGGESTIONS } from './suggestions';
import { VoiceOrb } from './VoiceOrb';

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Agent Direction : questions à la voix (ou au clavier), réponses lues à voix haute. */
export function AssistantPage() {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const [pending, setPending] = useState<{ question: string; spoken: boolean } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(voicePreference);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const conversations = useQuery({ queryKey: ['agent', 'conversations'], queryFn: fetchConversations });
  const turns = useQuery({
    queryKey: ['agent', 'turns', conversationId],
    queryFn: () => fetchTurns(conversationId ?? ''),
    enabled: Boolean(conversationId),
  });
  const shownTurns = conversationId ? (turns.data ?? []) : [];
  const lastTurn = shownTurns.at(-1);
  const earlier = shownTurns.slice(0, -1);

  // Page quittée pendant une lecture : on se tait.
  useEffect(() => () => stopSpeaking(), []);

  const read = (id: string, text: string) => {
    if (!speechSupported()) return;
    setSpeakingId(id);
    speak(text, () => setSpeakingId((current) => (current === id ? null : current)));
  };
  const silence = () => {
    stopSpeaking();
    setSpeakingId(null);
  };

  const ask = useMutation({
    mutationFn: askAgent,
    onMutate: ({ question, spoken }) => {
      silence();
      setFailure(null);
      setEarlierOpen(false);
      setPending({ question, spoken });
    },
    onSuccess: async (result) => {
      setConversationId(result.conversation_id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agent', 'turns', result.conversation_id] }),
        queryClient.invalidateQueries({ queryKey: ['agent', 'conversations'] }),
      ]);
      setPending(null);
      if (voiceOn) read(result.turn_id ?? 'derniere', result.answer);
    },
    onError: (error, { question }) => {
      setPending(null);
      // Question gardée dans la saisie : un appui sur Entrée suffit pour la renvoyer
      setDraft(question);
      setTyping(true);
      setFailure(error instanceof Error ? error.message : 'Assistant indisponible pour le moment');
    },
  });

  const send = (question: string, spoken: boolean, alternatives: string[] = []) => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setDraft('');
    ask.mutate({ conversationId, question: text, spoken, ...(alternatives.length ? { alternatives } : {}) });
  };

  const dictation = useDictation({
    onFinal: (text, alternatives) => send(text, true, alternatives),
    onError: (message) => toast.error(message),
    keyboard: 'pose ta question au clavier',
    // Plusieurs versions entendues : l'agent choisit celle qui a un sens dans un atelier
    alternatives: 3,
  });

  const remove = useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, id) => {
      if (id === conversationId) setConversationId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['agent', 'conversations'] });
    },
    onError: () => toast.error('Conversation non effacée : réessaie'),
  });

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    saveVoicePreference(next);
    if (!next) silence();
  };
  const startNew = () => {
    silence();
    setFailure(null);
    setConversationId(undefined);
  };
  const listen = () => {
    silence();
    setFailure(null);
    dictation.start();
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft, false);
  };

  const phase: OrbState = dictation.listening
    ? 'listening'
    : ask.isPending
      ? 'thinking'
      : speakingId
        ? 'speaking'
        : 'idle';
  const speakingLast = Boolean(lastTurn && speakingId === lastTurn.id) || speakingId === 'derniere';

  const hint = {
    listening: 'Parle normalement : la question part dès que tu fais une pause.',
    thinking: 'Tu peux attendre ici : rien n’est modifié dans l’appli.',
    speaking: 'Pose une autre question : la conversation continue.',
    idle: lastTurn
      ? 'Pose une autre question : la conversation continue.'
      : 'Appuie sur le micro et parle comme à quelqu’un du bureau.',
  }[phase];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Agent Direction' }]}
        title="Agent Direction"
        actions={
          <>
            <span className="sub hidden xl:inline">
              Pose ta question à la voix : il lit les chiffres de l’atelier, il ne modifie rien.
            </span>
            {speechSupported() && (
              <button
                type="button"
                className={cn('agent-voice', voiceOn && 'on')}
                aria-pressed={voiceOn}
                onClick={toggleVoice}
              >
                {voiceOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                Réponses lues
              </button>
            )}
            <Button
              variant="outline"
              aria-expanded={historyOpen}
              aria-controls="agent-history"
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <History /> Historique
            </Button>
            <Button variant="outline" onClick={startNew}>
              <Plus /> Nouvelle conversation
            </Button>
          </>
        }
      />

      <div className={cn('agent', historyOpen && 'with-history')}>
        <section className="agent-stage" aria-label="Conversation avec l’Agent Direction" aria-live="polite">
          <VoiceOrb state={phase} />

          {dictation.listening ? (
            <div className="agent-text">
              <p className="agent-status" role="status">
                <span className="dot" aria-hidden /> J’écoute
              </p>
              <p className="agent-big">
                {dictation.interim ? `« ${dictation.interim} »` : 'Pose ta question…'}
              </p>
            </div>
          ) : pending ? (
            <div className="agent-text">
              <Question text={pending.question} spoken={pending.spoken} />
              <p className="agent-big" role="status">
                Je regarde les chiffres…
              </p>
            </div>
          ) : lastTurn ? (
            <div className="agent-text">
              <Question text={lastTurn.question} spoken={lastTurn.spoken} />
              <p className="agent-answer">{lastTurn.answer}</p>
              <p className="agent-meta">
                {speechSupported() &&
                  (speakingLast ? (
                    <button type="button" className="agent-link on" onClick={silence}>
                      <Volume2 className="size-4" /> Lecture en cours
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="agent-link"
                      onClick={() => read(lastTurn.id, lastTurn.answer)}
                    >
                      <Volume2 className="size-4" /> Réécouter
                    </button>
                  ))}
                {lastTurn.tools.length > 0 && <span>{sourcesLabel(lastTurn.tools)}</span>}
              </p>
            </div>
          ) : (
            <div className="agent-text">
              <p className="agent-hello">
                Bonjour,
                <br />
                <span>que veux-tu savoir ?</span>
              </p>
            </div>
          )}

          {failure && (
            <p className="alert s-bad" role="alert">
              <b>{failure}</b>
              {failure.includes('réglages') && (
                <Link to="/reglages?onglet=atelier" className="link">
                  Ouvrir les réglages
                </Link>
              )}
            </p>
          )}

          <div className="agent-controls" role="group" aria-label="Commandes">
            {dictation.listening ? (
              <button
                type="button"
                className="rbtn"
                aria-label="Annuler la question"
                onClick={dictation.cancel}
              >
                <X className="size-5" />
              </button>
            ) : (
              <button
                type="button"
                className={cn('rbtn', typing && 'on')}
                aria-pressed={typing}
                aria-label="Écrire la question"
                onClick={() => setTyping(!typing)}
              >
                <Keyboard className="size-5" />
              </button>
            )}
            {dictation.supported ? (
              <button
                type="button"
                className={cn('rbtn big', dictation.listening && 'stop')}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? 'Arrêter l’écoute' : 'Poser la question à la voix'}
                disabled={ask.isPending}
                onClick={() => (dictation.listening ? dictation.stop() : listen())}
              >
                {dictation.listening ? <Square className="size-6" /> : <Mic className="size-7" />}
              </button>
            ) : (
              <span
                className="rbtn big off"
                title="Dictée indisponible sur ce navigateur : utilise Chrome, Edge ou Safari"
              >
                <MicOff className="size-6" aria-label="Dictée indisponible sur ce navigateur" />
              </span>
            )}
            {speakingId ? (
              <button type="button" className="rbtn" aria-label="Arrêter la lecture" onClick={silence}>
                <Square className="size-4" />
              </button>
            ) : (
              <button
                type="button"
                className={cn('rbtn', historyOpen && 'on')}
                aria-label="Afficher l’historique"
                aria-pressed={historyOpen}
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <History className="size-5" />
              </button>
            )}
          </div>
          <p className="hint">{hint}</p>

          {(typing || !dictation.supported) && !dictation.listening && (
            <form className="agent-type" onSubmit={onSubmit}>
              <Input
                value={draft}
                maxLength={2000}
                placeholder="Écris ta question…"
                aria-label="Question à l’agent"
                disabled={ask.isPending}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Envoyer la question"
                disabled={!draft.trim() || ask.isPending}
              >
                <ArrowUp />
              </Button>
            </form>
          )}

          {!lastTurn && !pending && !dictation.listening && (
            <ul className="chips justify-center" aria-label="Exemples de questions">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    className="chip"
                    disabled={ask.isPending}
                    onClick={() => send(suggestion, false)}
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {earlier.length > 0 && !pending && !dictation.listening && (
            <div className="agent-earlier">
              <button
                type="button"
                className="agent-link"
                aria-expanded={earlierOpen}
                onClick={() => setEarlierOpen(!earlierOpen)}
              >
                {earlierOpen
                  ? 'Masquer les échanges précédents'
                  : `Voir les échanges précédents (${earlier.length})`}
              </button>
              {earlierOpen && (
                <ol className="col gap-3">
                  {earlier.map((turn) => (
                    <EarlierTurn key={turn.id} turn={turn} />
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>

        {historyOpen && (
          <aside className="agent-history" id="agent-history" aria-labelledby="agent-history-title">
            <div className="row gap-2">
              <History className="size-4 text-muted-foreground" />
              <h2 className="h3 grow" id="agent-history-title">
                Conversations
              </h2>
              <button
                type="button"
                className="ibtn sm ghost"
                aria-label="Fermer l’historique"
                onClick={() => setHistoryOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            {conversations.isPending && <p className="hint">Chargement…</p>}
            {conversations.data?.length === 0 && <p className="hint">Aucune conversation pour l’instant.</p>}
            <ul className="col gap-1">
              {conversations.data?.map((conversation) => (
                <li key={conversation.id} className="row gap-1">
                  <button
                    type="button"
                    className={cn('agent-conv grow', conversation.id === conversationId && 'on')}
                    aria-current={conversation.id === conversationId ? 'true' : undefined}
                    onClick={() => {
                      silence();
                      setFailure(null);
                      setConversationId(conversation.id);
                    }}
                  >
                    <span className="truncate">{conversation.title}</span>
                    <small>{DAY.format(new Date(conversation.updated_at))}</small>
                  </button>
                  <button
                    type="button"
                    className="ibtn sm ghost"
                    aria-label={`Effacer la conversation « ${conversation.title} »`}
                    onClick={() => remove.mutate(conversation.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint mt-auto">Effacées automatiquement après 90 jours sans échange.</p>
          </aside>
        )}
      </div>
    </>
  );
}

function Question({ text, spoken }: { text: string; spoken: boolean }) {
  return (
    <p className="agent-question">
      {spoken && <Mic className="size-3.5" aria-label="Posée à la voix" />}
      {text}
    </p>
  );
}

function EarlierTurn({ turn }: { turn: AgentTurn }) {
  return (
    <li className="col gap-1">
      <Question text={turn.question} spoken={turn.spoken} />
      <p className="whitespace-pre-line">{turn.answer}</p>
    </li>
  );
}
