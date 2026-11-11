import { useCallback, useEffect, useRef, useState } from 'react';

/** Durée pendant laquelle la caméra reste allumée après le dernier geste sur la borne. */
export const CAMERA_AWAKE_MS = 45_000;

/**
 * Activité sur la borne : chaque toucher, clic ou touche de clavier la « réveille » pour
 * `durationMs`. Sans nouveau geste pendant ce temps, elle se rendort.
 */
export function useActivity(durationMs = CAMERA_AWAKE_MS) {
  const [awake, setAwake] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const wake = useCallback(() => {
    setAwake(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAwake(false), durationMs);
  }, [durationMs]);

  useEffect(() => {
    // Phase de capture : le geste compte même s'il ouvre une fenêtre ou arrête l'événement.
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    return () => {
      window.removeEventListener('pointerdown', wake, true);
      window.removeEventListener('keydown', wake, true);
      window.clearTimeout(timer.current);
    };
  }, [wake]);

  return awake;
}
