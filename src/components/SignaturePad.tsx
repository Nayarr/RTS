import { useEffect, useRef } from 'react';
import { Eraser } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useSignaturePad } from './use-signature-pad';

type SignaturePadState = ReturnType<typeof useSignaturePad>;

/** Zone de signature au doigt, au stylet ou à la souris (accord du client avant intervention). */
export function SignaturePad({ pad, label }: { pad: SignaturePadState; label: string }) {
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
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="block h-40 w-full touch-none rounded-md border bg-white"
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
      <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={isEmpty}>
        <Eraser /> Effacer la signature
      </Button>
    </div>
  );
}
