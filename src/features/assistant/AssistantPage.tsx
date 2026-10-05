import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, Mic, MicOff, Plus, Square, Trash2, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDictation } from '@/lib/use-dictation';
import { cn } from '@/lib/utils';
import { askAgent, deleteConversation, fetchConversations, fetchTurns, type AgentTurn } from './api';
import { saveVoicePreference, speak, speechSupported, stopSpeaking, voicePreference } from './speech';
import { SUGGESTIONS } from './suggestions';

const DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

/** Assistant de la direction : questions à la voix (ou au clavier), réponses lues à voix haute. */
export function AssistantPage() {
  const queryClient = useQueryClient();
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<{ question: string; spoken: boolean } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(voicePreference);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  const conversations = useQuery({ queryKey: ['agent', 'conversations'], queryFn: fetchConversations });
  const turns = useQuery({
    queryKey: ['agent', 'turns', conversationId],
    queryFn: () => fetchTurns(conversationId ?? ''),
    enabled: Boolean(conversationId),
  });
  const shownTurns = conversationId ? (turns.data ?? []) : [];

  // Page quittée pendant une lecture : on se tait.
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end', behavior: 'smooth' });
  }, [shownTurns.length, pending]);

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
      setFailure(error instanceof Error ? error.message : 'Assistant indisponible pour le moment');
    },
  });

  const send = (question: string, spoken: boolean) => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setDraft('');
    ask.mutate({ conversationId, question: text, spoken });
  };

  const dictation = useDictation({
    onFinal: (text) => send(text, true),
    onError: (message) => toast.error(message),
    keyboard: 'pose ta question au clavier',
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

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft, false);
  };

  const empty = shownTurns.length === 0 && !pending;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Pilotage' }, { label: 'Assistant' }]}
        title="Assistant"
        actions={
          <>
            <span className="sub hidden md:inline">
              Pose ta question à la voix, il lit les chiffres de l’atelier
            </span>
            {speechSupported() && (
              <button
                type="button"
                className="ibtn"
                aria-pressed={voiceOn}
                aria-label="Lire les réponses à voix haute"
                title={voiceOn ? 'Réponses lues à voix haute' : 'Réponses en silence'}
                onClick={toggleVoice}
              >
                {voiceOn ? <Volume2 className="size-[18px]" /> : <VolumeX className="size-[18px]" />}
              </button>
            )}
            <Button variant="outline" onClick={startNew}>
              <Plus /> Nouvelle conversation
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="card assistant" aria-label="Conversation avec l’assistant">
          <div className="assistant-feed" aria-live="polite">
            {empty && (
              <div className="assistant-empty">
                <p className="h3">Que veux-tu savoir ?</p>
                <p className="hint">
                  Appuie sur le micro et pose ta question comme à quelqu’un du bureau. Il lit les chiffres de
                  l’atelier mais ne modifie rien.
                </p>
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
              </div>
            )}

            {shownTurns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                speaking={speakingId === turn.id}
                onRead={() => (speakingId === turn.id ? silence() : read(turn.id, turn.answer))}
              />
            ))}

            {pending && (
              <div className="col gap-2">
                <p className="bubble q">
                  {pending.spoken && <Mic className="i xs" aria-label="Posée à la voix" />}
                  {pending.question}
                </p>
                <p className="bubble a thinking" role="status">
                  <span className="typing" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                  Je regarde les chiffres…
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
            <div ref={end} />
          </div>

          <form className="assistant-bar" onSubmit={onSubmit}>
            {dictation.supported ? (
              <button
                type="button"
                className={cn('mic', dictation.listening && 'on')}
                aria-pressed={dictation.listening}
                aria-label={dictation.listening ? 'Arrêter l’écoute' : 'Poser la question à la voix'}
                disabled={ask.isPending}
                onClick={() => (dictation.listening ? dictation.stop() : (silence(), dictation.start()))}
              >
                {dictation.listening ? <Square className="size-5" /> : <Mic className="size-6" />}
              </button>
            ) : (
              <span
                className="mic off"
                title="Dictée indisponible sur ce navigateur : utilise Chrome, Edge ou Safari"
              >
                <MicOff className="size-5" aria-label="Dictée indisponible sur ce navigateur" />
              </span>
            )}
            {dictation.listening ? (
              <p className="dictating grow" role="status">
                <span className="dot" aria-hidden />
                {dictation.interim ? `« ${dictation.interim} »` : 'J’écoute… pose ta question, puis attends.'}
              </p>
            ) : (
              <>
                <Input
                  className="grow"
                  value={draft}
                  maxLength={2000}
                  placeholder="Ou écris ta question…"
                  aria-label="Question à l’assistant"
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
              </>
            )}
          </form>
        </section>

        <aside className="card" aria-labelledby="assistant-history">
          <div className="card-h">
            <h2 className="h2" id="assistant-history">
              Conversations
            </h2>
          </div>
          <div className="card-b">
            {conversations.isPending && <p className="hint">Chargement…</p>}
            {conversations.data?.length === 0 && <p className="hint">Aucune conversation pour l’instant.</p>}
            <ul className="col gap-1">
              {conversations.data?.map((conversation) => (
                <li key={conversation.id} className="row gap-1">
                  <button
                    type="button"
                    className={cn('assistant-conv grow', conversation.id === conversationId && 'on')}
                    aria-current={conversation.id === conversationId ? 'true' : undefined}
                    onClick={() => {
                      silence();
                      setFailure(null);
                      setConversationId(conversation.id);
                    }}
                  >
                    <span className="truncate">{conversation.title}</span>
                    <span className="hint">{DAY.format(new Date(conversation.updated_at))}</span>
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
            <p className="hint mt-3">Effacées automatiquement après 90 jours sans échange.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function TurnView({ turn, speaking, onRead }: { turn: AgentTurn; speaking: boolean; onRead: () => void }) {
  return (
    <div className="col gap-2">
      <p className="bubble q">
        {turn.spoken && <Mic className="i xs" aria-label="Posée à la voix" />}
        {turn.question}
      </p>
      <div className="bubble a">
        <p className="whitespace-pre-line">{turn.answer}</p>
        {speechSupported() && (
          <button
            type="button"
            className="ibtn sm ghost self-start"
            aria-label={speaking ? 'Arrêter la lecture' : 'Réécouter la réponse'}
            onClick={onRead}
          >
            {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
