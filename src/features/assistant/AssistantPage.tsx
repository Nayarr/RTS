import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  History,
  Keyboard,
  Mail,
  Mic,
  MicOff,
  Plus,
  Square,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/app/PageHeader';
import { useProfile } from '@/features/auth/useProfile';
import { useSettings } from '@/features/settings/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDictation } from '@/lib/use-dictation';
import { cn } from '@/lib/utils';
import {
  askAgent,
  countMailsToHandle,
  deleteConversation,
  fetchBriefing,
  fetchConversations,
  fetchPendingActions,
  fetchPreparedReplies,
  fetchTurns,
  type AgentTurn,
} from './api';
import { AgentActions, type AgentActionsHandle } from './AgentActions';
import { AgentTable } from './AgentTable';
import { isGoAhead } from './agent-actions';
import { BriefingPlayer } from './BriefingPlayer';
import type { OrbState } from './VoiceOrb';
import {
  chosenVoiceName,
  saveVoiceName,
  saveVoicePreference,
  setVoiceProvider,
  speak,
  speechSupported,
  stopSpeaking,
  voiceLabel,
  voicePreference,
} from './speech';
import { useFrenchVoices } from './use-french-voices';
import { RECEPTION_SUGGESTIONS, sourcesLabel, SUGGESTIONS } from './suggestions';
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
  // Sans conversation ouverte : point du jour (à l'ouverture) ou page vide pour une nouvelle question
  const [briefingShown, setBriefingShown] = useState(true);
  const voices = useFrenchVoices();
  const [voiceName, setVoiceName] = useState(chosenVoiceName);
  // Voix réglée par la direction : Azure (voix naturelle) ou celle du navigateur
  const settings = useSettings();
  // Réception : lecture seule et mails, questions proposées sans chiffre d'affaires
  const isDirection = useProfile().data?.role !== 'reception';
  const azure = settings.data?.app.tts_provider === 'azure';
  useEffect(() => setVoiceProvider(azure ? 'azure' : 'browser'), [azure]);

  const conversations = useQuery({ queryKey: ['agent', 'conversations'], queryFn: fetchConversations });
  const turns = useQuery({
    queryKey: ['agent', 'turns', conversationId],
    queryFn: () => fetchTurns(conversationId ?? ''),
    enabled: Boolean(conversationId),
  });
  // Point du jour : fait à la première ouverture de la journée, puis relu tel quel
  const briefing = useQuery({
    queryKey: ['agent', 'briefing'],
    queryFn: () => fetchBriefing(),
    staleTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  // Réponses préparées aux mails reçus, lues après le point du jour
  const replies = useQuery({
    queryKey: ['agent', 'replies'],
    queryFn: fetchPreparedReplies,
    refetchInterval: 60_000,
  });
  const mailsToHandle = useQuery({
    queryKey: ['agent', 'mails', 'a-traiter'],
    queryFn: countMailsToHandle,
    refetchInterval: 2 * 60_000,
  });
  // Actions préparées par l'agent dans cette conversation, à valider
  const actions = useQuery({
    queryKey: ['agent', 'actions', conversationId],
    queryFn: () => fetchPendingActions(conversationId ?? ''),
    enabled: Boolean(conversationId),
  });
  const pendingActions = actions.data ?? [];
  const actionsRef = useRef<AgentActionsHandle>(null);
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
        queryClient.invalidateQueries({ queryKey: ['agent', 'actions', result.conversation_id] }),
      ]);
      // Réponse affichée tant que la conversation se charge : le point du jour ne revient pas
      // (en se fermant, il couperait la lecture de la réponse, Azure en particulier)
      setBriefingShown(false);
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
    // « Vas-y » avec une action en attente : on la valide plutôt que de reposer une question
    if (pendingActions.length > 0 && isGoAhead(text)) {
      setDraft('');
      actionsRef.current?.validateFirst();
      return;
    }
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

  const refreshBriefing = useMutation({
    mutationFn: () => fetchBriefing(true),
    onMutate: silence,
    onSuccess: (result) => {
      queryClient.setQueryData(['agent', 'briefing'], result);
      void queryClient.invalidateQueries({ queryKey: ['agent', 'replies'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Point du jour non refait'),
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
  const leaveConversation = (briefing: boolean) => {
    silence();
    setFailure(null);
    setEarlierOpen(false);
    setConversationId(undefined);
    setBriefingShown(briefing);
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

  const showBriefing = briefingShown && !lastTurn && !pending && !dictation.listening;
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
      : 'Pose une question pour détailler un point : « qui sont les factures en retard ? »',
  }[phase];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Agent Direction' }]}
        title="Agent Direction"
        actions={
          <>
            <span className="sub hidden 2xl:inline">
              {isDirection
                ? 'Pose ta question à la voix : il lit les chiffres de l’atelier et prépare ce que tu valides.'
                : 'Pose ta question à la voix : il lit les données de l’atelier et prépare les mails que tu relis.'}
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
            {voiceOn && !azure && voices.length > 1 && (
              <select
                className="inp h-9! w-auto!"
                aria-label="Voix de lecture"
                value={voices.some((voice) => voice.name === voiceName) ? voiceName : ''}
                onChange={(event) => {
                  setVoiceName(event.target.value);
                  saveVoiceName(event.target.value);
                  read('essai-voix', 'Bonjour, voici la voix qui lira le point du jour.');
                }}
              >
                <option value="">Voix la plus naturelle</option>
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voiceLabel(voice)}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              className={cn(showBriefing && 'border-transparent! bg-accent! text-accent-foreground!')}
              aria-pressed={showBriefing}
              onClick={() => leaveConversation(true)}
            >
              <Sun /> Point du jour
            </Button>
            <Button asChild variant="outline">
              <Link to="/agent-direction/mails">
                <Mail /> Mails reçus
                {Boolean(mailsToHandle.data) && (
                  <span className="agent-count" aria-label={`${mailsToHandle.data} à traiter`}>
                    {mailsToHandle.data}
                  </span>
                )}
              </Link>
            </Button>
            <Button
              variant="outline"
              aria-expanded={historyOpen}
              aria-controls="agent-history"
              onClick={() => setHistoryOpen(!historyOpen)}
            >
              <History /> Historique
            </Button>
            <Button variant="outline" onClick={() => leaveConversation(false)}>
              <Plus /> Nouvelle conversation
            </Button>
          </>
        }
      />

      <div className={cn('agent', historyOpen && 'with-history')}>
        <section className="agent-stage" aria-label="Conversation avec l’Agent Direction" aria-live="polite">
          {showBriefing ? (
            <BriefingPlayer
              briefing={briefing.data}
              loading={briefing.isPending || refreshBriefing.isPending}
              failure={briefing.error instanceof Error ? briefing.error.message : null}
              replies={replies.data ?? []}
              // Lecture lancée quand les réponses préparées sont là (sinon leurs mails ne sont pas lus)
              autoplay={voiceOn && !replies.isPending}
              refreshing={refreshBriefing.isPending}
              onRefresh={() => refreshBriefing.mutate()}
            />
          ) : (
            <VoiceOrb state={phase} />
          )}

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
                <span className="agent-thinking" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                <span className="sr-only">L’agent réfléchit</span>
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
              {lastTurn.tables.map((table, index) => (
                <AgentTable key={index} table={table} />
              ))}
              <AgentActions actions={pendingActions} ref={actionsRef} />
            </div>
          ) : null}

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
              {(isDirection ? SUGGESTIONS : RECEPTION_SUGGESTIONS).map((suggestion) => (
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
      {turn.tables.map((table, index) => (
        <AgentTable key={index} table={table} />
      ))}
    </li>
  );
}
