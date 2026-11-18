// Dictée par enregistrement (iPhone) : l'appli ouvre elle-même le micro, détecte la fin de la phrase,
// coupe le micro (voyant orange éteint) et envoie la question à Azure par la fonction « stt ».
//
// Pourquoi : sur iPhone, la dictée de Safari ne rend plus le micro après la lecture d'une réponse à
// voix haute ; la question suivante n'est jamais entendue et le voyant orange reste allumé.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/** iPhone ou iPad (tous les navigateurs y utilisent le moteur de Safari). */
export function isAppleMobile(
  nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> & { platform?: string } = navigator,
): boolean {
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  // iPad récent : se présente comme un Mac, mais tactile
  return nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
}

/** Le navigateur sait-il enregistrer le micro ? */
export const recordingSupported = () =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';

/** Fréquence envoyée à Azure (WAV PCM 16 bits mono). */
export const TARGET_RATE = 16_000;

/** Ramène l'enregistrement à 16 kHz (moyenne des échantillons de chaque intervalle). */
export function downsample(input: Float32Array, fromRate: number, toRate = TARGET_RATE): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let index = 0; index < output.length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(input.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor++) sum += input[cursor] ?? 0;
    output[index] = end > start ? sum / (end - start) : 0;
  }
  return output;
}

/** WAV PCM 16 bits mono : en-tête de 44 octets puis les échantillons. */
export function encodeWav(samples: Float32Array, rate = TARGET_RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index++) view.setUint8(offset + index, text.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return bytes;
}

/** Volume d'un morceau d'enregistrement (moyenne quadratique). */
export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export type SpeechState = 'waiting' | 'speaking' | 'done' | 'no-speech';

/**
 * Fin de la question : la parole est repérée au-dessus du bruit de fond, puis la question part
 * après un silence (comme la dictée de Safari). Rien entendu au bout de quelques secondes : abandon.
 * Question trop longue : envoyée telle quelle à la limite.
 *
 * Bruit de fond : le volume le plus bas des dernières secondes (les blancs entre les mots y
 * redescendent), plafonné à celui d'un atelier bruyant. Ainsi une question dite dès l'appui sur le
 * micro n'est pas prise pour du bruit, et un moteur qui tourne n'est pas pris pour une question.
 */
export class SpeechEndDetector {
  private recent: { level: number; ms: number }[] = [];
  private elapsed = 0;
  private quiet = 0;
  private heard = false;

  constructor(
    private readonly options = {
      silenceMs: 1_300,
      noSpeechMs: 8_000,
      maxMs: 28_000,
      /** Volume au-dessous duquel tout est silence (pièce calme). */
      minLevel: 0.015,
      /** Bruit de fond le plus fort pris en compte (atelier, moteur au ralenti). */
      maxNoise: 0.04,
      /** Fenêtre où l'on cherche le bruit de fond. */
      windowMs: 3_000,
    },
  ) {}

  /** Morceau suivant : son volume et sa durée. */
  push(level: number, durationMs: number): SpeechState {
    const { silenceMs, noSpeechMs, maxMs, minLevel, maxNoise, windowMs } = this.options;
    this.elapsed += durationMs;
    this.recent.push({ level, ms: durationMs });
    let kept = 0;
    for (let index = this.recent.length - 1; index >= 0; index--) {
      kept += this.recent[index]?.ms ?? 0;
      if (kept > windowMs) {
        this.recent = this.recent.slice(index + 1);
        break;
      }
    }
    const noise = Math.min(maxNoise, ...this.recent.map((item) => item.level));
    const speech = level > Math.max(minLevel, noise * 2.5);
    if (speech) {
      this.heard = true;
      this.quiet = 0;
    } else {
      this.quiet += durationMs;
    }
    if (this.elapsed >= maxMs) return this.heard ? 'done' : 'no-speech';
    if (!this.heard) return this.elapsed >= noSpeechMs ? 'no-speech' : 'waiting';
    return this.quiet >= silenceMs ? 'done' : 'speaking';
  }

  get speechHeard() {
    return this.heard;
  }
}

export type RecordingEnd = { audio: Uint8Array } | { error: 'no-speech' | 'not-allowed' | 'start' };

export interface Recording {
  /** Fin demandée (bouton) : la question part si quelque chose a été dit. */
  stop: () => void;
  /** Abandon : rien n'est envoyé. */
  cancel: () => void;
}

type AudioContextConstructor = typeof AudioContext;

/**
 * Ouvre le micro et enregistre une question. `onReady` : le micro capte vraiment ; `onEnd` : la
 * question terminée (WAV 16 kHz) ou la raison de l'échec. Le micro est coupé (pistes arrêtées,
 * voyant éteint) dès la fin, avant tout envoi.
 */
export function startRecording({
  onReady,
  onEnd,
}: {
  onReady: () => void;
  onEnd: (end: RecordingEnd) => void;
}): Recording {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let finished = false;
  const chunks: Float32Array[] = [];
  const detector = new SpeechEndDetector();

  /** Micro coupé et son libéré : rien ne reste ouvert après la question. */
  const release = () => {
    processor?.disconnect();
    source?.disconnect();
    if (processor) processor.onaudioprocess = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    processor = null;
    source = null;
    stream = null;
    context = null;
  };

  const finish = (send: boolean) => {
    if (finished) return;
    finished = true;
    const rate = context?.sampleRate ?? TARGET_RATE;
    release();
    if (!send) return;
    if (!detector.speechHeard) {
      onEnd({ error: 'no-speech' });
      return;
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const samples = new Float32Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    onEnd({ audio: encodeWav(downsample(samples, rate)) });
  };

  const fail = (error: 'not-allowed' | 'start') => {
    if (finished) return;
    finished = true;
    release();
    onEnd({ error });
  };

  void (async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (finished) {
        // Annulé pendant la demande d'accès : micro rendu aussitôt
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = media;
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
      if (!Context) throw new Error('AudioContext indisponible');
      context = new Context();
      if (context.state === 'suspended') await context.resume();
      source = context.createMediaStreamSource(media);
      processor = context.createScriptProcessor(4096, 1, 1);
      // Sortie muette : le traitement ne tourne que relié à la sortie
      const mute = context.createGain();
      mute.gain.value = 0;
      source.connect(processor);
      processor.connect(mute).connect(context.destination);
      let ready = false;
      processor.onaudioprocess = (event) => {
        if (finished || !context) return;
        const input = event.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(input));
        if (!ready) {
          ready = true;
          onReady();
        }
        const state = detector.push(rms(input), (input.length / context.sampleRate) * 1000);
        if (state === 'done') finish(true);
        if (state === 'no-speech') finish(true);
      };
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      fail(name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'start');
    }
  })();

  return { stop: () => finish(true), cancel: () => finish(false) };
}

/** Question enregistrée transcrite par Azure : texte et autres versions entendues. */
export async function transcribe(audio: Uint8Array): Promise<{ text: string; alternatives: string[] }> {
  const response = await supabase.functions.invoke<{ text: string; alternatives: string[] }>('stt', {
    body: new Blob([audio as BlobPart], { type: 'audio/wav' }),
    headers: { 'Content-Type': 'audio/wav' },
  });
  const error: unknown = response.error;
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await (error.context as Response).json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error ?? 'Dictée indisponible : réessaie ou écris ta question');
    }
    throw new Error('Dictée impossible sans réseau : écris ta question');
  }
  return { text: response.data?.text ?? '', alternatives: response.data?.alternatives ?? [] };
}
