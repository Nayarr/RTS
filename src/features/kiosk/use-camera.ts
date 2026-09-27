import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'starting' | 'ready' | 'denied' | 'unsupported';

const PHOTO_WIDTH = 320;

/** Absente hors contexte sécurisé (http) et sur les vieux navigateurs, malgré les types du DOM. */
const cameraSupported = () => typeof navigator.mediaDevices?.getUserMedia === 'function';

/** Caméra frontale de la borne : aperçu en direct et photo prise au moment du pointage. */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>(() => (cameraSupported() ? 'starting' : 'unsupported'));

  useEffect(() => {
    if (!cameraSupported()) return;
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
        if (videoRef.current) videoRef.current.srcObject = media;
        setState('ready');
      })
      .catch(() => !cancelled && setState('denied'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  /** Photo JPEG réduite (320 px de large), ou `null` si la caméra ne donne pas d'image. */
  const capture = useCallback(async (): Promise<Blob | null> => {
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
