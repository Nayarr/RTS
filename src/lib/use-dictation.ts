import { useEffect, useRef, useState } from 'react';
import {
  isAppleMobile,
  recordingSupported,
  startRecording,
  transcribe,
  type Recording,
} from './recorded-dictation';

/** Reconnaissance vocale du navigateur (Chrome / Android, Safari / iPhone) : pas de type fourni par TypeScript. */
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  /** Le micro capte vraiment : on peut parler. */
  onaudiostart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

/** Le navigateur sait-il dicter ? (sinon le bouton micro n'est pas affiché) */
export const dictationSupported = () => recognitionConstructor() !== undefined;

/** Petit « bip » : le micro est ouvert, on peut parler (rien si le son n'est pas disponible). */
export function playListenBeep() {
  const Context =
    typeof window === 'undefined'
      ? undefined
      : (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Context) return;
  try {
    const context = new Context();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    const close = () => {
      if (context.state !== 'closed') void context.close().catch(() => {});
    };
    oscillator.onended = close;
    // Son suspendu (iPhone en veille, onglet caché) : fin du bip jamais signalée, on ferme quand même
    setTimeout(close, 1000);
  } catch {
    // Son bloqué par le navigateur : l'affichage « Parle maintenant » suffit.
  }
}

/**
 * Délai laissé au navigateur pour terminer l'écoute après la phrase. Safari sur iPhone ne signale
 * pas toujours la fin (`onend`) : le micro restait ouvert (voyant orange) et la question suivante
 * n'était plus écoutée. Passé ce délai, l'écoute est abandonnée et le micro libéré.
 */
export const RELEASE_DELAY_MS = 1500;

/** Texte dicté mis en forme pour une ligne de travaux : majuscule, sans point final. */
export function dictatedText(transcript: string): string {
  const text = transcript
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.。]+$/, '');
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);
}

/** Message affiché quand la dictée échoue (code d'erreur du navigateur). */
export function dictationError(code: string, keyboard = 'saisis la tâche au clavier'): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return 'Micro refusé : autorise le micro pour l’appli dans les réglages du téléphone.';
  }
  if (code === 'network') return `Dictée impossible sans réseau : ${keyboard}.`;
  if (code === 'no-speech') return 'Rien entendu : appuie sur le micro et parle près du téléphone.';
  if (code === 'silent') {
    return 'Le micro ne répond pas : appuie de nouveau. Si ça recommence, ferme l’appli et rouvre-la.';
  }
  return `Dictée interrompue : réessaie ou ${keyboard}.`;
}

/**
 * Dictée en français : `start` écoute une phrase, `interim` affiche ce qui est compris pendant qu'on
 * parle, `onFinal` reçoit la phrase terminée. Un nouvel appui (`stop`) arrête l'écoute.
 * `keyboard` : ce qu'on propose de faire au clavier quand la dictée échoue.
 * `alternatives` : nombre de versions entendues demandées au navigateur ; `onFinal` reçoit les
 * autres versions en second paramètre (utile pour corriger un mot mal compris).
 * `beep` : bip joué quand le micro est réellement ouvert (`ready` passe alors à vrai).
 * `recorded` : sur iPhone, l'appli enregistre elle-même la question et la fait transcrire par Azure
 * (fonction « stt ») au lieu de la dictée de Safari, qui ne rend plus le micro après la lecture d'une
 * réponse à voix haute. Pas de texte en direct : `transcribing` vaut vrai pendant la transcription.
 */
export function useDictation({
  onFinal,
  onError,
  keyboard,
  alternatives = 1,
  beep = false,
  recorded = false,
}: {
  onFinal: (text: string, alternatives: string[]) => void;
  onError: (message: string) => void;
  keyboard?: string;
  alternatives?: number;
  beep?: boolean;
  recorded?: boolean;
}) {
  // Choix fait une fois : il ne change pas tant que la page est ouverte
  const [byRecording] = useState(() => recorded && isAppleMobile() && recordingSupported());
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recording = useRef<Recording | null>(null);
  /** Enregistrement en cours : un résultat d'un enregistrement abandonné est ignoré. */
  const run = useRef(0);
  const [ready, setReady] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const cancelled = useRef(false);
  const handlers = useRef({ onFinal, onError, keyboard });
  useEffect(() => {
    handlers.current = { onFinal, onError, keyboard };
  });

  /** Écoute terminée : plus aucun évènement de cette reconnaissance, prêt pour la suivante. */
  const release = (rec: SpeechRecognitionLike) => {
    rec.onresult = null;
    rec.onerror = null;
    rec.onaudiostart = null;
    rec.onend = null;
    if (recognition.current !== rec) return;
    recognition.current = null;
    setListening(false);
    setReady(false);
    setInterim('');
  };

  /** Arrête (ou abandonne) l'écoute, puis libère le micro même si le navigateur ne répond plus. */
  const close = (rec: SpeechRecognitionLike, how: 'stop' | 'abort') => {
    try {
      rec[how]();
    } catch {
      // Déjà arrêtée
    }
    setTimeout(() => {
      try {
        rec.abort();
      } catch {
        // Déjà arrêtée
      }
      release(rec);
    }, RELEASE_DELAY_MS);
  };

  /** Enregistrement abandonné : micro coupé, rien n'est envoyé. */
  const dropRecording = () => {
    run.current++;
    recording.current?.cancel();
    recording.current = null;
    setListening(false);
    setReady(false);
    setTranscribing(false);
  };

  // Fiche quittée en pleine dictée, ou appli passée en arrière-plan : on coupe le micro.
  useEffect(() => {
    const abandon = () => {
      if (recording.current) dropRecording();
      const rec = recognition.current;
      if (!rec) return;
      cancelled.current = true;
      try {
        rec.abort();
      } catch {
        // Déjà arrêtée
      }
      release(rec);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') abandon();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', abandon);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', abandon);
      abandon();
    };
  }, []);

  const startRecorded = () => {
    dropRecording();
    const mine = ++run.current;
    const fail = (message: string) => handlers.current.onError(message);
    setListening(true);
    recording.current = startRecording({
      onReady: () => {
        if (mine !== run.current) return;
        setReady(true);
        if (beep) playListenBeep();
      },
      onEnd: (end) => {
        if (mine !== run.current) return;
        recording.current = null;
        setListening(false);
        setReady(false);
        if ('error' in end) {
          fail(dictationError(end.error, handlers.current.keyboard));
          return;
        }
        setTranscribing(true);
        transcribe(end.audio)
          .then(({ text, alternatives: others }) => {
            if (mine !== run.current) return;
            const final = dictatedText(text);
            if (!final) {
              fail(dictationError('no-speech', handlers.current.keyboard));
              return;
            }
            const variants = others.map(dictatedText).filter((variant) => variant && variant !== final);
            handlers.current.onFinal(final, variants);
          })
          .catch((error: unknown) => {
            if (mine === run.current) fail(error instanceof Error ? error.message : 'Dictée indisponible');
          })
          .finally(() => {
            if (mine === run.current) setTranscribing(false);
          });
      },
    });
  };

  const start = () => {
    if (byRecording) {
      startRecorded();
      return;
    }
    const Recognition = recognitionConstructor();
    if (!Recognition) return;
    // Écoute précédente jamais terminée (iPhone) : on la coupe au lieu d'ignorer l'appui
    const previous = recognition.current;
    if (previous) {
      try {
        previous.abort();
      } catch {
        // Déjà arrêtée
      }
      release(previous);
    }
    cancelled.current = false;
    const rec = new Recognition();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = alternatives;
    rec.onresult = (event) => {
      let finalText = '';
      let pending = '';
      const others: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? '';
        if (result?.isFinal) {
          finalText += transcript;
          for (let rank = 1; rank < result.length; rank++) others.push(result[rank]?.transcript ?? '');
        } else pending += transcript;
      }
      setInterim(pending);
      const text = dictatedText(finalText);
      const variants = others.map(dictatedText).filter((variant) => variant && variant !== text);
      if (text && !cancelled.current) {
        // Une seule phrase par écoute : on ferme tout de suite, sans attendre le navigateur
        cancelled.current = true;
        close(rec, 'stop');
        release(rec);
        handlers.current.onFinal(text, variants);
      }
    };
    rec.onerror = (event) => {
      if (event.error !== 'aborted')
        handlers.current.onError(dictationError(event.error, handlers.current.keyboard));
    };
    rec.onaudiostart = () => {
      setReady(true);
      if (beep) playListenBeep();
    };
    rec.onend = () => release(rec);
    recognition.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      recognition.current = null;
      setListening(false);
      handlers.current.onError(dictationError('start', handlers.current.keyboard));
    }
  };

  const stop = () => {
    recording.current?.stop();
    if (recognition.current) close(recognition.current, 'stop');
  };
  /** Arrête l'écoute sans rien envoyer. */
  const cancel = () => {
    if (byRecording) dropRecording();
    cancelled.current = true;
    if (recognition.current) close(recognition.current, 'abort');
  };

  return {
    supported: byRecording || dictationSupported(),
    listening,
    ready,
    interim,
    transcribing,
    start,
    stop,
    cancel,
  };
}
