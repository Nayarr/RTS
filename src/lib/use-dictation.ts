import { useEffect, useRef, useState } from 'react';

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
    oscillator.onended = () => void context.close().catch(() => {});
  } catch {
    // Son bloqué par le navigateur : l'affichage « Parle maintenant » suffit.
  }
}

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
  return `Dictée interrompue : réessaie ou ${keyboard}.`;
}

/**
 * Dictée en français : `start` écoute une phrase, `interim` affiche ce qui est compris pendant qu'on
 * parle, `onFinal` reçoit la phrase terminée. Un nouvel appui (`stop`) arrête l'écoute.
 * `keyboard` : ce qu'on propose de faire au clavier quand la dictée échoue.
 * `alternatives` : nombre de versions entendues demandées au navigateur ; `onFinal` reçoit les
 * autres versions en second paramètre (utile pour corriger un mot mal compris).
 * `beep` : bip joué quand le micro est réellement ouvert (`ready` passe alors à vrai).
 */
export function useDictation({
  onFinal,
  onError,
  keyboard,
  alternatives = 1,
  beep = false,
}: {
  onFinal: (text: string, alternatives: string[]) => void;
  onError: (message: string) => void;
  keyboard?: string;
  alternatives?: number;
  beep?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const [ready, setReady] = useState(false);
  const [interim, setInterim] = useState('');
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const cancelled = useRef(false);
  const handlers = useRef({ onFinal, onError, keyboard });
  useEffect(() => {
    handlers.current = { onFinal, onError, keyboard };
  });

  // Fiche quittée en pleine dictée : on coupe le micro.
  useEffect(() => () => recognition.current?.abort(), []);

  const start = () => {
    const Recognition = recognitionConstructor();
    if (!Recognition || recognition.current) return;
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
      if (text && !cancelled.current) handlers.current.onFinal(text, variants);
    };
    rec.onerror = (event) => {
      if (event.error !== 'aborted')
        handlers.current.onError(dictationError(event.error, handlers.current.keyboard));
    };
    rec.onaudiostart = () => {
      setReady(true);
      if (beep) playListenBeep();
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      setReady(false);
      setInterim('');
    };
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

  const stop = () => recognition.current?.stop();
  /** Arrête l'écoute sans rien envoyer. */
  const cancel = () => {
    cancelled.current = true;
    recognition.current?.abort();
  };

  return { supported: dictationSupported(), listening, ready, interim, start, stop, cancel };
}
