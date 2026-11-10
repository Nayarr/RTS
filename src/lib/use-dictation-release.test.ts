import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_DELAY_MS, useDictation } from './use-dictation';

/**
 * Reconnaissance vocale simulée comme Safari sur iPhone : après la phrase, `onend` n'arrive
 * jamais tout seul. Le micro n'est rendu qu'après `abort()`.
 */
class IphoneRecognition {
  static instances: IphoneRecognition[] = [];
  lang = '';
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  micOpen = false;
  start = vi.fn(() => {
    this.micOpen = true;
  });
  stop = vi.fn();
  abort = vi.fn(() => {
    this.micOpen = false;
  });
  constructor() {
    IphoneRecognition.instances.push(this);
  }
  say(text: string) {
    const result = Object.assign([{ transcript: text }], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

const scope = window as unknown as { webkitSpeechRecognition?: unknown };

describe('micro de l’Agent Direction sur iPhone', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    IphoneRecognition.instances = [];
    scope.webkitSpeechRecognition = IphoneRecognition;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete scope.webkitSpeechRecognition;
  });

  const setup = () => {
    const onFinal = vi.fn();
    const hook = renderHook(() => useDictation({ onFinal, onError: vi.fn() }));
    return { hook, onFinal };
  };

  it('deuxième question écoutée même si la première écoute n’a jamais signalé sa fin', () => {
    const { hook, onFinal } = setup();
    act(() => hook.result.current.start());
    const first = IphoneRecognition.instances[0]!;
    act(() => first.say('combien de factures en retard'));
    expect(onFinal).toHaveBeenCalledWith('Combien de factures en retard', []);
    expect(hook.result.current.listening).toBe(false);

    act(() => hook.result.current.start());
    expect(IphoneRecognition.instances).toHaveLength(2);
    expect(IphoneRecognition.instances[1]!.start).toHaveBeenCalled();
  });

  it('micro rendu (voyant orange éteint) peu après la phrase', () => {
    const { hook } = setup();
    act(() => hook.result.current.start());
    const rec = IphoneRecognition.instances[0]!;
    act(() => rec.say('point du jour'));
    expect(rec.stop).toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(RELEASE_DELAY_MS);
    });
    expect(rec.abort).toHaveBeenCalled();
    expect(rec.micOpen).toBe(false);
  });

  it('arrêt demandé sans réponse du navigateur : écoute libérée après le délai', () => {
    const { hook } = setup();
    act(() => hook.result.current.start());
    act(() => hook.result.current.stop());
    expect(hook.result.current.listening).toBe(true);
    act(() => {
      vi.advanceTimersByTime(RELEASE_DELAY_MS);
    });
    expect(hook.result.current.listening).toBe(false);
    expect(IphoneRecognition.instances[0]!.micOpen).toBe(false);
  });

  it('écoute restée ouverte : un nouvel appui la coupe et en démarre une autre', () => {
    const { hook } = setup();
    act(() => hook.result.current.start());
    act(() => hook.result.current.start());
    expect(IphoneRecognition.instances[0]!.abort).toHaveBeenCalled();
    expect(IphoneRecognition.instances[1]!.start).toHaveBeenCalled();
    expect(hook.result.current.listening).toBe(true);
  });

  it('appli passée en arrière-plan ou page quittée : micro coupé', () => {
    const { hook } = setup();
    act(() => hook.result.current.start());
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(IphoneRecognition.instances[0]!.micOpen).toBe(false);
    expect(hook.result.current.listening).toBe(false);

    act(() => hook.result.current.start());
    hook.unmount();
    expect(IphoneRecognition.instances[1]!.micOpen).toBe(false);
  });
});
