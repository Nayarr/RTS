import { useEffect, useRef } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useSignaturePad } from './use-signature-pad';

type SignaturePadState = ReturnType<typeof useSignaturePad>;

/** Zone de signature au doigt, au stylet ou à la souris (accord du client avant intervention). */
export function SignaturePad({
  pad,
  label,
  showClear = true,
}: {
  pad: SignaturePadState;
  label: string;
  /** Bouton « Effacer » sous la zone (sinon placé par la page, dans l'en-tête de la carte). */
  showClear?: boolean;
}) {
  const { canvasRef, isEmpty, setIsEmpty, clear } = pad;

  // Résolution adaptée à l'écran (net sur tablette), trait noir de 2 px.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111';
  }, [canvasRef]);

  const last = useRef<{ x: number; y: number } | null>(null);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className="col gap-2.5">
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className="block h-[220px] w-full touch-none rounded-xl border-[1.5px] border-dashed border-input bg-head dark:bg-white"
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            last.current = point(event);
          }}
          onPointerMove={(event) => {
            if (!last.current) return;
            const next = point(event);
            const context = event.currentTarget.getContext('2d');
            context?.beginPath();
            context?.moveTo(last.current.x, last.current.y);
            context?.lineTo(next.x, next.y);
            context?.stroke();
            last.current = next;
            if (isEmpty) setIsEmpty(false);
          }}
          onPointerUp={() => (last.current = null)}
          onPointerLeave={() => (last.current = null)}
        />
        {isEmpty && (
          <span className="hint pointer-events-none absolute bottom-3 left-4">Signez dans le cadre</span>
        )}
      </div>
      {showClear && (
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={isEmpty}>
          <Eraser /> Effacer la signature
        </Button>
      )}
    </div>
  );
}
