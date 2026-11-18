import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  downsample,
  encodeWav,
  FIRST_SOUND_MS,
  isAppleMobile,
  SpeechEndDetector,
  startRecording,
  transcribe,
} from './recorded-dictation';
import type * as Recorded from './recorded-dictation';
import { dictationError, useDictation } from './use-dictation';

vi.mock('./recorded-dictation', async (importOriginal) => ({
  ...(await importOriginal<typeof Recorded>()),
  // Le hook se croit sur iPhone ; la transcription par Azure est simulée
  isAppleMobile: vi.fn(() => true),
  transcribe: vi.fn(),
}));

const FRAME = 4096;
const RATE = 48_000;
const FRAME_MS = (FRAME / RATE) * 1000;

/** Micro simulé : pistes dont on suit l'arrêt (voyant orange allumé tant qu'une piste vit). */
class FakeTrack {
  live = true;
  /** iOS reprend le micro (appel, Siri) : la piste se termine d'elle-même. */
  onended: (() => void) | null = null;
  stop = vi.fn(() => {
    this.live = false;
  });
}

const tracks: FakeTrack[] = [];
let processor: { onaudioprocess: ((event: unknown) => void) | null } | null = null;
const contexts: {
  state: string;
  close: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
}[] = [];
/** État du son à sa création (iPhone : « suspended » hors d'un appui). */
let initialState = 'running';
/** Relance du son jamais terminée (iPhone hors d'un appui). */
let resumeHangs = false;

class FakeAudioContext {
  sampleRate = RATE;
  state = initialState;
  destination = {};
  close = vi.fn(() => {
    this.state = 'closed';
    return Promise.resolve();
  });
  resume = vi.fn(() => (resumeHangs ? new Promise<void>(() => undefined) : Promise.resolve()));
  constructor() {
    contexts.push(this);
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createScriptProcessor() {
    processor = {
      onaudioprocess: null,
      connect: vi.fn((node: unknown) => node),
      disconnect: vi.fn(),
    } as never;
    return processor;
  }
  createGain() {
    return { gain: { value: 1 }, connect: vi.fn() };
  }
}

/** Morceau d'enregistrement : parole (signal fort) ou silence. */
const frame = (level: number) => ({
  inputBuffer: { getChannelData: () => new Float32Array(FRAME).fill(level) },
});
const feed = (level: number, frames: number) => {
  for (let index = 0; index < frames; index++) processor?.onaudioprocess?.(frame(level));
};
const micOn = () => tracks.some((track) => track.live);
/** Accès au micro accordé (promesses résolues) sans faire avancer les minuteries simulées. */
const settle = async () => {
  for (let step = 0; step < 10; step++) await Promise.resolve();
};

beforeEach(() => {
  tracks.length = 0;
  contexts.length = 0;
  processor = null;
  initialState = 'running';
  resumeHangs = false;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(() => {
        const track = new FakeTrack();
        tracks.push(track);
        return Promise.resolve({ getTracks: () => [track] });
      }),
    },
  });
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
});
afterEach(() => {
  vi.useRealTimers();
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

describe('enregistrement de la question (iPhone)', () => {
  it('iPhone et iPad repérés, Android et Mac non', async () => {
    const { isAppleMobile: real } = await vi.importActual<typeof Recorded>('./recorded-dictation');
    const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({
      userAgent,
      platform,
      maxTouchPoints,
    });
    expect(real(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'))).toBe(true);
    expect(real(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5))).toBe(true);
    expect(real(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0))).toBe(false);
    expect(real(nav('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5))).toBe(false);
    expect(vi.mocked(isAppleMobile)).toBeDefined();
  });

  it('48 kHz ramenés à 16 kHz, WAV PCM 16 bits mono', () => {
    const samples = downsample(new Float32Array([0, 0.3, 0.6, 1, 1, 1]), 48_000);
    expect(Array.from(samples)).toEqual([expect.closeTo(0.3), 1]);
    const bytes = encodeWav(new Float32Array([0, 1, -1]));
    const view = new DataView(bytes.buffer);
    const text = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([
      0, 32767, -32768,
    ]);
  });

  it('fin de la question : après une pause, rien entendu, ou trop longue', () => {
    const pause = new SpeechEndDetector();
    expect(pause.push(0.001, 500)).toBe('waiting');
    expect(pause.push(0.2, 1000)).toBe('speaking');
    expect(pause.push(0.001, 1000)).toBe('speaking');
    expect(pause.push(0.001, 400)).toBe('done');

    const nothing = new SpeechEndDetector();
    expect(nothing.push(0.002, 7000)).toBe('waiting');
    expect(nothing.push(0.002, 1000)).toBe('no-speech');

    const long = new SpeechEndDetector();
    for (let second = 0; second < 27; second++) expect(long.push(0.3, 1000)).toBe('speaking');
    expect(long.push(0.3, 1000)).toBe('done');

    // Atelier bruyant : un bruit de fond régulier n'est pas pris pour une question
    const noisy = new SpeechEndDetector();
    expect(noisy.push(0.05, 500)).toBe('waiting');
    expect(noisy.push(0.06, 500)).toBe('waiting');
    expect(noisy.push(0.4, 500)).toBe('speaking');
  });

  it('question terminée : micro coupé avant l’envoi, enregistrement WAV rendu', async () => {
    const onReady = vi.fn();
    const onEnd = vi.fn();
    startRecording({ onReady, onEnd });
    await waitFor(() => expect(processor).not.toBeNull());
    feed(0.3, 10);
    expect(onReady).toHaveBeenCalledOnce();
    expect(micOn()).toBe(true);
    feed(0.001, Math.ceil(1300 / FRAME_MS) + 1);
    expect(micOn()).toBe(false);
    expect(contexts[0]?.close).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledOnce();
    const end = onEnd.mock.calls[0]?.[0] as { audio: Uint8Array };
    expect(String.fromCharCode(...end.audio.subarray(0, 4))).toBe('RIFF');
  });

  it('rien dit : micro coupé, « Rien entendu » ; abandon : micro coupé, rien envoyé', async () => {
    const onEnd = vi.fn();
    startRecording({ onReady: vi.fn(), onEnd });
    await waitFor(() => expect(processor).not.toBeNull());
    feed(0.001, Math.ceil(8000 / FRAME_MS) + 1);
    expect(micOn()).toBe(false);
    expect(onEnd).toHaveBeenCalledWith({ error: 'no-speech' });

    processor = null;
    const cancelled = vi.fn();
    const recording = startRecording({ onReady: vi.fn(), onEnd: cancelled });
    await waitFor(() => expect(processor).not.toBeNull());
    feed(0.3, 5);
    recording.cancel();
    expect(micOn()).toBe(false);
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('micro refusé : message pour autoriser le micro', async () => {
    const { mediaDevices } = navigator as unknown as {
      mediaDevices: { getUserMedia: ReturnType<typeof vi.fn> };
    };
    mediaDevices.getUserMedia.mockRejectedValueOnce(new DOMException('refusé', 'NotAllowedError'));
    const onEnd = vi.fn();
    startRecording({ onReady: vi.fn(), onEnd });
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith({ error: 'not-allowed' }));
  });
});

describe('Agent Direction sur iPhone : deux questions de suite', () => {
  it('chaque question est entendue, le micro est rendu après chacune', async () => {
    vi.mocked(transcribe)
      .mockResolvedValueOnce({ text: 'quelles factures sont en retard', alternatives: ['quels factures'] })
      .mockResolvedValueOnce({ text: 'et pour Martin', alternatives: [] });
    const onFinal = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ onFinal, onError, recorded: true, alternatives: 3 }));
    expect(result.current.supported).toBe(true);

    for (const [index, expected] of ['Quelles factures sont en retard', 'Et pour Martin'].entries()) {
      processor = null;
      act(() => result.current.start());
      expect(result.current.listening).toBe(true);
      await waitFor(() => expect(processor).not.toBeNull());
      act(() => {
        feed(0.3, 10);
        feed(0.001, Math.ceil(1300 / FRAME_MS) + 1);
      });
      // Micro coupé dès la fin de la phrase, avant même la transcription
      expect(micOn()).toBe(false);
      expect(result.current.listening).toBe(false);
      await waitFor(() => expect(onFinal).toHaveBeenCalledTimes(index + 1));
      expect(onFinal).toHaveBeenLastCalledWith(expected, index === 0 ? ['Quels factures'] : []);
      expect(result.current.transcribing).toBe(false);
    }
    expect(tracks).toHaveLength(2);
    expect(onError).not.toHaveBeenCalled();
  });

  it('écoute annulée : micro coupé, rien envoyé', async () => {
    const onFinal = vi.fn();
    const { result } = renderHook(() => useDictation({ onFinal, onError: vi.fn(), recorded: true }));
    act(() => result.current.start());
    await waitFor(() => expect(processor).not.toBeNull());
    act(() => result.current.cancel());
    expect(micOn()).toBe(false);
    expect(result.current.listening).toBe(false);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('Azure indisponible : message affiché, la question peut être écrite', async () => {
    vi.mocked(transcribe).mockRejectedValueOnce(
      new Error('Dictée indisponible : réessaie ou écris ta question'),
    );
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ onFinal: vi.fn(), onError, recorded: true }));
    act(() => result.current.start());
    await waitFor(() => expect(processor).not.toBeNull());
    act(() => {
      feed(0.3, 10);
      feed(0.001, Math.ceil(1300 / FRAME_MS) + 1);
    });
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Dictée indisponible : réessaie ou écris ta question'),
    );
    expect(micOn()).toBe(false);
  });
});

describe('micro qui ne répond pas (iPhone, après la première question)', () => {
  it('son créé et relancé pendant l’appui, avant la demande d’accès au micro', () => {
    initialState = 'suspended';
    startRecording({ onReady: vi.fn(), onEnd: vi.fn() });
    // Tout de suite, sans attendre l'accès au micro : encore dans l'appui sur le bouton
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalled();
  });

  it('relance du son jamais terminée : l’écoute démarre quand même', async () => {
    initialState = 'suspended';
    resumeHangs = true;
    const onReady = vi.fn();
    startRecording({ onReady, onEnd: vi.fn() });
    await waitFor(() => expect(processor).not.toBeNull());
    feed(0.3, 1);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('aucun son en 3 s : micro rendu, « silent », plus d’écoute bloquée', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onEnd = vi.fn();
    startRecording({ onReady: vi.fn(), onEnd });
    await settle();
    expect(processor).not.toBeNull();
    expect(micOn()).toBe(true);
    vi.advanceTimersByTime(FIRST_SOUND_MS - 1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(micOn()).toBe(false);
    expect(contexts[0]?.close).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith({ error: 'silent' });
  });

  it('le micro capte à temps : pas d’abandon après 3 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onEnd = vi.fn();
    startRecording({ onReady: vi.fn(), onEnd });
    await settle();
    expect(processor).not.toBeNull();
    feed(0.001, 1);
    vi.advanceTimersByTime(FIRST_SOUND_MS * 2);
    expect(onEnd).not.toHaveBeenCalled();
    expect(micOn()).toBe(true);
  });

  it('micro repris par iOS : rien dit, « silent » ; question commencée, elle part', async () => {
    const onEnd = vi.fn();
    startRecording({ onReady: vi.fn(), onEnd });
    await waitFor(() => expect(processor).not.toBeNull());
    feed(0.001, 1);
    tracks[0]?.onended?.();
    expect(onEnd).toHaveBeenCalledWith({ error: 'silent' });
    expect(micOn()).toBe(false);

    processor = null;
    const sent = vi.fn();
    startRecording({ onReady: vi.fn(), onEnd: sent });
    await waitFor(() => expect(processor).not.toBeNull());
    feed(0.3, 10);
    tracks[1]?.onended?.();
    const end = sent.mock.calls[0]?.[0] as { audio: Uint8Array };
    expect(String.fromCharCode(...end.audio.subarray(0, 4))).toBe('RIFF');
  });

  it('message affiché, puis la question suivante est entendue', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.mocked(transcribe).mockResolvedValueOnce({ text: 'et pour Martin', alternatives: [] });
    const onFinal = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ onFinal, onError, recorded: true }));

    // Première écoute : le micro ne donne aucun son
    act(() => result.current.start());
    await settle();
    expect(processor).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(FIRST_SOUND_MS);
    });
    expect(onError).toHaveBeenCalledWith(dictationError('silent'));
    expect(result.current.listening).toBe(false);
    expect(micOn()).toBe(false);

    // Appui suivant : micro rouvert de zéro, question entendue
    processor = null;
    act(() => result.current.start());
    await settle();
    expect(processor).not.toBeNull();
    act(() => {
      feed(0.3, 10);
      feed(0.001, Math.ceil(1300 / FRAME_MS) + 1);
    });
    await vi.waitFor(() => expect(onFinal).toHaveBeenCalledWith('Et pour Martin', []));
    expect(tracks).toHaveLength(2);
    expect(micOn()).toBe(false);
  });

  it('message clair : réessayer, sinon fermer et rouvrir l’appli', () => {
    expect(dictationError('silent')).toBe(
      'Le micro ne répond pas : appuie de nouveau. Si ça recommence, ferme l’appli et rouvre-la.',
    );
  });
});
