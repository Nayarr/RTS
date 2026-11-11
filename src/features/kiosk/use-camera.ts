import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'off' | 'starting' | 'ready' | 'denied' | 'unsupported';

const PHOTO_WIDTH = 320;
/** Caméra qui vient de s'allumer : attente de la première image avant la photo. */
const FIRST_FRAME_TIMEOUT_MS = 4000;
const FRAME_POLL_MS = 100;

/** Absente hors contexte sécurisé (http) et sur les vieux navigateurs, malgré les types du DOM. */
const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === 'function';

/**
 * Caméra frontale de la borne : allumée seulement quand `active` (quelqu'un utilise la borne),
 * éteinte sinon. Aperçu en direct et photo prise au moment du pointage.
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Résultat de l'allumage en cours : null tant que la caméra démarre (ou quand elle est éteinte).
  const [result, setResult] = useState<'ready' | 'denied' | null>(null);
  const supported = cameraSupported();
  const state: CameraState = !supported ? 'unsupported' : !active ? 'off' : (result ?? 'starting');

  useEffect(() => {
    if (!cameraSupported() || !active) return;
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 } }, audio: false })
      .then((media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        if (video) video.srcObject = media;
        setResult('ready');
      })
      .catch(() => !cancelled && setResult('denied'));
    return () => {
      cancelled = true;
      // Caméra éteinte : le voyant de la tablette s'éteint aussi.
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
      setResult(null);
    };
  }, [active]);

  /**
   * Photo JPEG réduite (320 px de large), ou `null` si la caméra ne donne pas d'image. La caméra
   * peut s'être allumée au dernier moment : on attend sa première image quelques secondes.
   */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const started = Date.now();
    while (!videoRef.current?.videoWidth && Date.now() - started < FIRST_FRAME_TIMEOUT_MS) {
      await new Promise((resolve) => window.setTimeout(resolve, FRAME_POLL_MS));
    }
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_WIDTH;
    canvas.height = Math.round((PHOTO_WIDTH * video.videoHeight) / video.videoWidth);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.6));
  }, []);

  return { videoRef, state, capture };
}
