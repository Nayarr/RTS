import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { orbMesh, orbTarget, type OrbState } from './orb-mesh';

const STATE_LABELS: Record<OrbState, string> = {
  idle: 'Assistant prêt',
  listening: 'Assistant à l’écoute',
  thinking: 'Assistant en train de chercher',
  speaking: 'Assistant en train de répondre',
};

/** Couleurs du thème (vert RTS clair ou sombre), relues quand le thème change. */
function themeColors(element: Element) {
  const style = getComputedStyle(element);
  return {
    back: style.getPropertyValue('--primary').trim() || '#137017',
    front: style.getPropertyValue('--accent-foreground').trim() || '#137017',
  };
}

/**
 * Orbe vocale : un maillage organique vert qui ondule au repos, s'agite pendant l'écoute, tourne
 * pendant la recherche et pulse pendant la lecture. Image fixe si l'appareil demande moins
 * d'animations.
 */
export function VoiceOrb({ state, size = 280 }: { state: OrbState; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    element.width = size * ratio;
    element.height = size * ratio;
    context.scale(ratio, ratio);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let colors = themeColors(element);
    let frame = 0;
    let handle = 0;
    let phase = 0.4;
    let turn = -16;
    let last = performance.now();
    const current = { amp: 1, radius: 0.66 };

    const draw = (now: number) => {
      const t = now / 1000;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (frame++ % 30 === 0) colors = themeColors(element);
      const target = orbTarget(stateRef.current, t);
      current.amp += (target.amp - current.amp) * 0.08;
      current.radius += (target.radius - current.radius) * 0.08;
      phase += dt * target.speed * 2;
      turn += dt * (stateRef.current === 'thinking' ? 40 : 6);

      const half = size / 2;
      context.clearRect(0, 0, size, size);
      const glow = context.createRadialGradient(half, half, 0, half, half, half * 0.82);
      glow.addColorStop(0, colors.back);
      glow.addColorStop(1, 'transparent');
      context.globalAlpha = stateRef.current === 'speaking' ? 0.16 : 0.11;
      context.fillStyle = glow;
      context.fillRect(0, 0, size, size);

      const bins = orbMesh({
        amp: current.amp,
        phase,
        tilt: 24,
        turn,
        radius: (size / 2) * current.radius,
        center: half,
      });
      const looks = [
        { color: colors.back, alpha: 0.2, width: 0.65 },
        { color: colors.back, alpha: 0.5, width: 0.7 },
        { color: colors.front, alpha: 0.95, width: 0.8 },
      ];
      bins.forEach((lines, index) => {
        const look = looks[index];
        if (!look) return;
        context.globalAlpha = look.alpha;
        context.strokeStyle = look.color;
        context.lineWidth = look.width;
        context.beginPath();
        for (const line of lines) {
          line.forEach(([x, y], point) => (point === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
        }
        context.stroke();
      });
      context.globalAlpha = 1;
      if (!still) handle = requestAnimationFrame(draw);
    };
    handle = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(handle);
  }, [size]);

  return (
    <div className={cn('orb', `orb-${state}`)} style={{ width: size, height: size }}>
      <span className="orb-ring" aria-hidden />
      <span className="orb-ring far" aria-hidden />
      <canvas
        ref={canvas}
        role="img"
        aria-label={STATE_LABELS[state]}
        style={{ width: size, height: size }}
      />
    </div>
  );
}
