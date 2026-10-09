import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Clock,
  Eye,
  Mail,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  Send,
  SkipForward,
  Volume2,
} from 'lucide-react';
import { toast } from 'sonner';
import { SendLinkDialog } from '@/components/SendLinkDialog';
import { useDictation } from '@/lib/use-dictation';
import { useMediaQuery } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import { postponeReply, sendPreparedReply, type AgentBriefing, type PreparedReply } from './api';
import {
  briefingPhrases,
  localDay,
  readListened,
  saveListened,
  SEND_DELAY_MS,
  briefingSteps,
  nextMail,
  replyLines,
  repliesToRead,
  senderName,
  skipTarget,
  voiceCommand,
  type VoiceCommand,
} from './briefing-player';
import { CATEGORY_META } from './mails';
import { speak, speechSupported, stopSpeaking } from './speech';
import { sourcesLabel } from './suggestions';
import { VoiceOrb } from './VoiceOrb';

const TIME = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const DAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
type Status = 'idle' | 'playing' | 'paused' | 'waiting' | 'done';

/**
 * Point du jour lu à voix haute : les phrases une par une (celle en cours surlignée), puis, pour
 * chaque mail avec une réponse préparée, ce que demande l'expéditeur, la réponse dictée et la
 * question « Je l'envoie ? » (Envoyer, Modifier, Plus tard, au clic ou à la voix). Rien ne part
 * sans décision, et un envoi décidé s'annule pendant 5 secondes. Le point reste affiché après
 * l'écoute.
 */
export function BriefingPlayer({
  briefing,
  loading,
  failure,
  replies,
  autoplay,
  refreshing,
  onRefresh,
}: {
  briefing: AgentBriefing | undefined;
  loading: boolean;
  failure: string | null;
  replies: PreparedReply[];
  /** Lecture automatique à l'ouverture (réponses lues activées, point pas encore écouté aujourd'hui). */
  autoplay: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const phone = useMediaQuery('(max-width: 1023px)');
  const phrases = useMemo(() => (briefing ? briefingPhrases(briefing) : []), [briefing]);
  // Réponses figées pendant la lecture : un envoi ne décale pas les étapes en cours
  const [playReplies, setPlayReplies] = useState<PreparedReply[] | null>(null);
  const steps = useMemo(
    () => briefingSteps(phrases, playReplies ?? replies),
    [phrases, playReplies, replies],
  );
  const [status, setStatus] = useState<Status>('idle');
  const [index, setIndex] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [composer, setComposer] = useState<PreparedReply | null>(null);
  const [listenedAt, setListenedAt] = useState<string | null>(() => {
    const listened = readListened();
    return listened?.day === localDay() ? listened.at : null;
  });
  const timer = useRef<number | null>(null);
  const token = useRef(0);
  const started = useRef(false);
  // Réponse à « Je l'envoie ? » dite à voix haute (décision lue par la dernière version de decide)
  const decideRef = useRef<(decision: VoiceCommand) => void>(() => undefined);
  const command = useDictation({
    onFinal: (text) => {
      const decision = voiceCommand(text);
      if (decision) decideRef.current(decision);
    },
    onError: () => undefined,
  });

  const current = status === 'idle' || status === 'done' ? undefined : steps[index];
  const activeReplyId = focusId ?? (current && current.kind !== 'phrase' ? current.replyId : null);
  const activeReply = replies.find((reply) => reply.id === activeReplyId) ?? null;
  const toRead = repliesToRead(playReplies ?? replies);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['agent', 'replies'] });
  const finish = () => {
    const now = new Date();
    saveListened(now);
    setListenedAt(now.toISOString());
    setStatus('done');
    setPlayReplies(null);
  };
  const goTo = (target: number) => {
    if (target >= steps.length) finish();
    else {
      setIndex(target);
      setStatus('playing');
    }
  };

  // Lecture de l'étape en cours ; une étape terminée passe à la suivante
  useEffect(() => {
    if (status !== 'playing') return;
    const step = steps[index];
    if (!step) return;
    const mine = ++token.current;
    speak(step.text, () => {
      if (mine !== token.current) return;
      if (step.kind === 'mail-ask') {
        setStatus('waiting');
        if (command.supported) command.start();
      } else if (index + 1 >= steps.length) finish();
      else setIndex(index + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé seulement quand l'étape change
  }, [status, index]);

  // Page quittée : on se tait, l'envoi en attente est annulé
  useEffect(
    () => () => {
      token.current++;
      stopSpeaking();
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const play = (from = 0) => {
    if (!speechSupported()) return;
    setFocusId(null);
    setPlayReplies(replies);
    setIndex(from);
    setStatus('playing');
  };
  const pause = () => {
    token.current++;
    stopSpeaking();
    command.cancel();
    setStatus('paused');
  };

  // Lecture automatique à l'ouverture, une fois par jour
  useEffect(() => {
    if (started.current || !autoplay || !briefing || loading || listenedAt || !speechSupported()) return;
    started.current = true;
    play(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule fois, quand le point est prêt
  }, [autoplay, briefing, loading]);

  const afterDecision = () => {
    setCountdown(null);
    refresh();
    if (focusId) setFocusId(null);
    else if (status === 'waiting') goTo(nextMail(steps, index));
  };

  const send = useMutation({
    mutationFn: sendPreparedReply,
    onSuccess: (_, reply) => {
      toast.success(`Réponse envoyée à ${reply.from_address}`);
      afterDecision();
    },
    onError: (error) => {
      setCountdown(null);
      toast.error(error instanceof Error ? error.message : 'Réponse non envoyée');
    },
  });
  const later = useMutation({
    mutationFn: (reply: PreparedReply) => postponeReply(reply.id),
    onSuccess: afterDecision,
    onError: () => toast.error('Réponse non remise à plus tard : réessaie'),
  });

  const cancelSend = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setCountdown(null);
  };
  const decide = (reply: PreparedReply, decision: VoiceCommand) => {
    token.current++;
    stopSpeaking();
    command.cancel();
    if (decision === 'later') later.mutate(reply);
    if (decision === 'edit') setComposer(reply);
    if (decision === 'send') {
      setCountdown(reply.id);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        send.mutate(reply);
      }, SEND_DELAY_MS);
    }
  };

  useEffect(() => {
    decideRef.current = (decision) => {
      if (activeReply) decide(activeReply, decision);
    };
  });

  const skip = () => {
    token.current++;
    stopSpeaking();
    command.cancel();
    goTo(skipTarget(steps, index));
  };

  if (loading || failure || !briefing) {
    return (
      <section className="brief" aria-label="Point du jour" aria-busy={loading}>
        <div className="brief-side">
          <VoiceOrb state={loading ? 'thinking' : 'idle'} size={phone ? 96 : 220} />
          <div className="brief-title">
            <h2 className="brief-h">Point du jour</h2>
            {loading ? (
              <p className="hint" role="status">
                Je fais le point sur l’atelier…
              </p>
            ) : (
              <p className="hint">Point du jour indisponible : {failure ?? 'réessaie dans un instant'}</p>
            )}
          </div>
        </div>
      </section>
    );
  }

  const orbState =
    status === 'playing' ? 'speaking' : status === 'waiting' && command.listening ? 'listening' : 'idle';
  const mailMode = Boolean(activeReply);
  const mailPosition = activeReply ? toRead.findIndex((reply) => reply.id === activeReply.id) + 1 : 0;
  const phraseStep = current?.kind === 'phrase' ? current.index : null;
  const listened = status === 'done' || (status === 'idle' && listenedAt);
  const playing = status === 'playing' || status === 'waiting';

  return (
    <section className="brief" aria-label="Point du jour">
      <div className="brief-side">
        <VoiceOrb state={orbState} size={phone ? 96 : 220} />
        <div className="brief-title">
          <h2 className="brief-h">{mailMode && !focusId ? 'Réponse préparée' : 'Point du jour'}</h2>
          <p className="hint">
            {mailMode && activeReply && !focusId
              ? `mail ${mailPosition} sur ${toRead.length} · ${senderName(activeReply)}`
              : `${DAY.format(new Date(`${briefing.day}T12:00:00`))} · ${
                  listened && listenedAt
                    ? `écouté à ${TIME.format(new Date(listenedAt))}`
                    : `fait à ${TIME.format(new Date(briefing.updated_at))}`
                }`}
          </p>
        </div>
        <div className="brief-player">
          {speechSupported() &&
            (playing ? (
              <button type="button" className="brief-play" onClick={pause}>
                <Pause className="size-4" /> Pause
              </button>
            ) : status === 'paused' ? (
              <button type="button" className="brief-play" onClick={() => setStatus('playing')}>
                <Play className="size-4" /> Reprendre
              </button>
            ) : (
              <button type="button" className="brief-play" onClick={() => play(0)}>
                {listened ? <Play className="size-4" /> : <Volume2 className="size-4" />}
                {listened ? 'Réécouter' : 'Écouter'}
              </button>
            ))}
          {(playing || status === 'paused') && (
            <button type="button" className="rbtn" aria-label="Passer à la suite" onClick={skip}>
              <SkipForward className="size-4" />
            </button>
          )}
          <button
            type="button"
            className="rbtn"
            aria-label="Refaire le point avec les données du moment"
            title="Refaire le point avec les données du moment"
            disabled={refreshing || playing}
            onClick={onRefresh}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          </button>
        </div>
        {playing || status === 'paused' ? (
          <div className="brief-progress">
            <span className="brief-track" aria-hidden>
              <i style={{ width: `${Math.round(((index + 1) / Math.max(steps.length, 1)) * 100)}%` }} />
            </span>
            <span className="hint">
              {current?.kind === 'phrase'
                ? `Phrase ${current.index + 1} sur ${phrases.length}`
                : status === 'waiting'
                  ? 'J’attends ta réponse'
                  : 'Lecture de la réponse'}
            </span>
          </div>
        ) : (
          listened && (
            <p className="hint brief-note">
              Le point reste ici toute la journée. Le bouton « Point du jour » en haut le rouvre depuis
              n’importe quelle conversation.
            </p>
          )
        )}
      </div>

      <div className="brief-main">
        {mailMode && activeReply ? (
          <>
            <button
              type="button"
              className="brief-folded"
              onClick={() => {
                if (playing) pause();
                setFocusId(null);
                if (!playing) setStatus(listened ? 'done' : 'idle');
              }}
            >
              <span className="brief-ok" aria-hidden>
                <Check className="size-3.5" />
              </span>
              <span className="grow">Le point du jour · {phrases.length} phrases</span>
              <span className="agent-link on">
                Revoir <ChevronDown className="size-3.5" />
              </span>
            </button>
            <RepliesHead replies={replies} position={focusId ? null : mailPosition} total={toRead.length} />
            <MailCard
              reply={activeReply}
              line={current?.kind === 'mail-line' && current.replyId === activeReply.id ? current.line : null}
              waiting={status === 'waiting'}
              listening={command.listening}
              voice={command.supported}
              counting={countdown === activeReply.id}
              busy={send.isPending || later.isPending}
              onDecide={(decision) => decide(activeReply, decision)}
              onCancel={cancelSend}
            />
            {replies
              .filter((reply) => reply.id !== activeReply.id)
              .map((reply) => (
                <ReplyRow
                  key={reply.id}
                  reply={reply}
                  counting={countdown === reply.id}
                  onOpen={() => {
                    if (playing) pause();
                    setFocusId(reply.id);
                  }}
                  onSend={() => decide(reply, 'send')}
                  onCancel={cancelSend}
                />
              ))}
          </>
        ) : (
          <>
            <ol className="brief-phrases">
              {phrases.map((phrase, at) => {
                const now = phraseStep === at;
                const read = playing && phraseStep !== null && at < phraseStep;
                return (
                  <li
                    key={at}
                    className={cn('brief-phrase', now && 'now', read && 'read')}
                    aria-current={now || undefined}
                  >
                    <span className="brief-num">{at + 1}</span>
                    <span className="col min-w-0 gap-0.5">
                      {phrase.etiquette && (
                        <b className={cn('brief-label', phrase.urgent && 'urgent')}>{phrase.etiquette}</b>
                      )}
                      <span className="brief-text">{phrase.texte}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {replies.length > 0 && (
              <>
                <RepliesHead replies={replies} position={null} total={toRead.length} />
                {replies.map((reply) => (
                  <ReplyRow
                    key={reply.id}
                    reply={reply}
                    counting={countdown === reply.id}
                    onOpen={() => {
                      if (playing) pause();
                      setFocusId(reply.id);
                    }}
                    onSend={() => decide(reply, 'send')}
                    onCancel={cancelSend}
                  />
                ))}
              </>
            )}
            {briefing.tools.length > 0 && (
              <p className="hint brief-sources">{sourcesLabel(briefing.tools)}</p>
            )}
          </>
        )}
      </div>

      {composer && (
        <SendLinkDialog
          title={`Répondre à ${senderName(composer)}`}
          intro="Réponse préparée par l’Agent Direction : relis-la et modifie-la avant de l’envoyer."
          message={{
            subject: composer.reply_subject ?? `Re: ${composer.subject}`,
            body: composer.reply_body ?? '',
            sms: '',
          }}
          senderEmail={null}
          mailCategory="workshop"
          contact={{ email: composer.from_address, phone: '' }}
          onContactSave={() => undefined}
          inboxEmailId={composer.id}
          onSend={(channel) => {
            if (channel === 'email') afterDecision();
          }}
          onClose={() => setComposer(null)}
        />
      )}
    </section>
  );
}

function RepliesHead({
  replies,
  position,
  total,
}: {
  replies: PreparedReply[];
  position: number | null;
  total: number;
}) {
  const sent = replies.filter((reply) => reply.reply_status === 'sent').length;
  return (
    <div className="brief-replies-h">
      <Mail className="size-4" />
      <h3 className="grow">Réponses préparées</h3>
      <span className="hint">
        {position
          ? `${position} sur ${total}`
          : sent
            ? `${sent} envoyée${sent > 1 ? 's' : ''} sur ${replies.length}`
            : `${replies.length} à relire`}
      </span>
    </div>
  );
}

function ReplyRow({
  reply,
  counting,
  onOpen,
  onSend,
  onCancel,
}: {
  reply: PreparedReply;
  counting: boolean;
  onOpen: () => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const sent = reply.reply_status === 'sent';
  return (
    <div className="brief-reply">
      <span
        className="mail-dot"
        style={{ '--c': reply.urgency === 'urgente' ? '#B5453A' : '#9CA3AF' } as CSSProperties}
        aria-hidden
      />
      <span className="col min-w-0 grow gap-0.5">
        <b className="truncate">
          {senderName(reply)}
          {reply.clients && ` · ${reply.clients.name}`}
        </b>
        <span className="hint truncate">
          {reply.summary ?? reply.subject}
          {reply.reply_status === 'postponed' && ' · tu as dit « plus tard »'}
        </span>
      </span>
      {sent ? (
        <span className="brief-sent">
          <Check className="size-3.5" /> Envoyée à{' '}
          {TIME.format(new Date(reply.reply_sent_at ?? reply.received_at))}
        </span>
      ) : counting ? (
        <button type="button" className="brief-btn" onClick={onCancel}>
          Annuler l’envoi
        </button>
      ) : (
        <span className="row gap-2">
          <button
            type="button"
            className="brief-btn"
            onClick={onOpen}
            aria-label={`Relire la réponse à ${senderName(reply)}`}
          >
            <Eye className="size-3.5" /> Relire
          </button>
          <button
            type="button"
            className="brief-btn go"
            onClick={onSend}
            aria-label={`Envoyer la réponse à ${senderName(reply)}`}
          >
            <Send className="size-3.5" /> Envoyer
          </button>
        </span>
      )}
    </div>
  );
}

function MailCard({
  reply,
  line,
  waiting,
  listening,
  voice,
  counting,
  busy,
  onDecide,
  onCancel,
}: {
  reply: PreparedReply;
  line: number | null;
  waiting: boolean;
  listening: boolean;
  voice: boolean;
  counting: boolean;
  busy: boolean;
  onDecide: (decision: VoiceCommand) => void;
  onCancel: () => void;
}) {
  const category = reply.category ? CATEGORY_META[reply.category] : undefined;
  const urgent = reply.urgency === 'urgente';
  const lines = replyLines(reply.reply_body);
  const sent = reply.reply_status === 'sent';
  return (
    <article className="brief-mail" aria-label={`Mail de ${senderName(reply)}`}>
      <div className="row items-start gap-2.5">
        <span
          className="mail-dot"
          style={{ '--c': urgent ? '#B5453A' : '#9CA3AF' } as CSSProperties}
          aria-hidden
        />
        <span className="col min-w-0 grow gap-0.5">
          <b>
            {senderName(reply)}
            {reply.clients && ` · ${reply.clients.name}`}
          </b>
          <span className="hint">
            « {reply.subject || 'sans objet'} » · reçu à {TIME.format(new Date(reply.received_at))}
            {reply.mailbox && ` sur ${reply.mailbox.split('@')[0]}@`}
          </span>
        </span>
        {category && (
          <span
            className={cn('badge', urgent && 'brief-urgent')}
            style={{ '--c': urgent ? '#B5453A' : category.color } as CSSProperties}
          >
            {urgent ? `Urgent · ${category.label.toLowerCase()}` : category.label}
          </span>
        )}
      </div>
      {reply.reply_request && (
        <div className="col gap-1">
          <span className="brief-cap">Ce qu’il demande</span>
          <p className="brief-request">{reply.reply_request}</p>
        </div>
      )}
      <div className="brief-draft">
        <span className="brief-cap accent">
          Réponse préparée{line !== null ? ' · en cours de lecture' : ''}
        </span>
        <p className="brief-draft-text">
          {lines.map((text, at) => (
            <span key={at} className={cn(at === line && 'now')}>
              {text}
            </span>
          ))}
        </p>
      </div>
      {reply.reply_basis && <p className="hint">S’appuie sur : {reply.reply_basis}</p>}
      {sent ? (
        <p className="brief-sent">
          <Check className="size-3.5" /> Réponse envoyée à{' '}
          {TIME.format(new Date(reply.reply_sent_at ?? reply.received_at))}
        </p>
      ) : (
        <div className="brief-ask">
          {counting ? (
            <div className="row flex-wrap items-center gap-3">
              <b className="grow">Envoi dans 5 secondes à {reply.from_address}</b>
              <button type="button" className="brief-btn" onClick={onCancel}>
                Annuler l’envoi
              </button>
            </div>
          ) : (
            <>
              <b>Je l’envoie à {reply.from_address} depuis atelier@ ?</b>
              <div className="brief-actions">
                <button
                  type="button"
                  className="brief-btn go"
                  disabled={busy}
                  onClick={() => onDecide('send')}
                >
                  <Send className="size-4" /> Envoyer
                </button>
                <button type="button" className="brief-btn" disabled={busy} onClick={() => onDecide('edit')}>
                  <PenLine className="size-4" /> Modifier
                </button>
                <button type="button" className="brief-btn" disabled={busy} onClick={() => onDecide('later')}>
                  <Clock className="size-4" /> Plus tard
                </button>
              </div>
              {voice && waiting && (
                <span className="hint">
                  {listening ? 'J’écoute : ' : 'ou réponds à la voix : '}« envoie », « modifie » ou « plus
                  tard »
                </span>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
