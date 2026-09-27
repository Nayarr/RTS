import { useCallback, useRef, useState } from 'react';

/** État d'une zone de signature : tracé présent, effacement, export en PNG. */
export function useSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  }, []);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        if (!canvasRef.current || isEmpty) return resolve(null);
        canvasRef.current.toBlob(resolve, 'image/png');
      }),
    [isEmpty],
  );

  /** Signature en data URL PNG (envoyée telle quelle par la page publique du devis). */
  const toDataUrl = useCallback(
    () => (canvasRef.current && !isEmpty ? canvasRef.current.toDataURL('image/png') : null),
    [isEmpty],
  );

  return { canvasRef, isEmpty, setIsEmpty, clear, toBlob, toDataUrl };
}
