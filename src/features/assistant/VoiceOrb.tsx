import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

const STATE_LABELS: Record<OrbState, string> = {
  idle: 'Assistant prêt',
  listening: 'Assistant à l’écoute',
  thinking: 'Assistant en train de chercher',
  speaking: 'Assistant en train de répondre',
};

/**
 * Orbe vocale : un rond vert, calme au repos. Des ondes en partent quand quelqu'un parle : cercles
 * tracés pendant l'écoute (la direction parle), disques pleins pendant la lecture (l'agent parle,
 * le rond respire avec lui). Un arc tourne autour pendant la recherche. Fixe si l'appareil demande
 * moins d'animations.
 */
export function VoiceOrb({ state, size = 280 }: { state: OrbState; size?: number }) {
  return (
    <div
      className={cn('orb', `orb-${state}`)}
      style={{ '--orb': `${size}px` } as CSSProperties}
      role="img"
      aria-label={STATE_LABELS[state]}
    >
      <span className="orb-wave" aria-hidden />
      <span className="orb-wave" aria-hidden />
      <span className="orb-wave" aria-hidden />
      <span className="orb-arc" aria-hidden />
      <span className="orb-core" aria-hidden />
    </div>
  );
}
