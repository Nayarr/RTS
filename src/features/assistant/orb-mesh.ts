/**
 * Maillage de l'orbe vocale (même calcul que la maquette Figma) : une sphère déformée par des
 * ondes, vue de biais, découpée en lignes de latitude et quelques méridiens. Chaque morceau de
 * ligne est rangé selon sa profondeur (arrière, milieu, avant) pour être dessiné plus ou moins
 * marqué.
 */

export interface OrbShape {
  /** Force de la déformation (1 : calme). */
  amp: number;
  /** Phase des ondes : la faire avancer anime la forme. */
  phase: number;
  /** Inclinaison et rotation de la vue, en degrés. */
  tilt: number;
  turn: number;
  /** Rayon de la forme et centre, en pixels. */
  radius: number;
  center: number;
}

export interface MeshDensity {
  latitudes: number;
  meridians: number;
  steps: number;
}

export type OrbPoint = [number, number];

const DEFAULT_DENSITY: MeshDensity = { latitudes: 36, meridians: 12, steps: 84 };

/** Lignes du maillage, par profondeur : [arrière, milieu, avant]. */
export function orbMesh(shape: OrbShape, density: MeshDensity = DEFAULT_DENSITY): OrbPoint[][][] {
  const a = (shape.tilt * Math.PI) / 180;
  const b = (shape.turn * Math.PI) / 180;
  const { amp, phase: ph, radius: R, center: c } = shape;
  const project = (u: number, v: number) => {
    let x = Math.cos(u) * Math.cos(v);
    let y = Math.sin(u);
    let z = Math.cos(u) * Math.sin(v);
    // Déformation continue sur la sphère (pas de pointe aux pôles)
    const d =
      1 +
      amp *
        (0.09 * Math.sin(2.1 * x + 1.6 * y + ph) +
          0.065 * Math.sin(2.9 * y - 2.3 * z + ph * 0.8) +
          0.045 * Math.sin(3.8 * z + 3.3 * x - ph * 1.3) +
          0.02 * Math.sin(5.5 * x - 4.6 * y + 2.1 * z + ph * 2));
    x *= d;
    y *= d;
    z *= d;
    const y1 = y * Math.cos(a) - z * Math.sin(a);
    const z1 = y * Math.sin(a) + z * Math.cos(a);
    const x2 = x * Math.cos(b) - y1 * Math.sin(b);
    const y2 = x * Math.sin(b) + y1 * Math.cos(b);
    return { point: [c + R * x2, c - R * y2] as OrbPoint, depth: z1 };
  };
  const bins: OrbPoint[][][] = [[], [], []];
  const binOf = (depth: number) => (depth < -0.2 ? 0 : depth < 0.35 ? 1 : 2);
  const addLine = (samples: { point: OrbPoint; depth: number }[]) => {
    const first = samples[0];
    if (!first) return;
    let run: OrbPoint[] = [first.point];
    let current = binOf(first.depth);
    for (const sample of samples.slice(1)) {
      const bin = binOf(sample.depth);
      run.push(sample.point);
      if (bin !== current) {
        if (run.length > 1) bins[current]?.push(run);
        run = [sample.point];
        current = bin;
      }
    }
    if (run.length > 1) bins[current]?.push(run);
  };
  const { latitudes, meridians, steps } = density;
  for (let i = 1; i < latitudes; i++) {
    const u = -Math.PI / 2 + (i / latitudes) * Math.PI;
    addLine(Array.from({ length: steps + 1 }, (_, s) => project(u, (s / steps) * 2 * Math.PI)));
  }
  const meridianSteps = Math.round(steps / 2);
  for (let j = 0; j < meridians; j++) {
    const v = (j / meridians) * 2 * Math.PI + ph * 0.2;
    addLine(
      Array.from({ length: meridianSteps - 3 }, (_, s) =>
        project(-Math.PI / 2 + ((s + 2) / meridianSteps) * Math.PI, v),
      ),
    );
  }
  return bins;
}

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Forme visée pour un état, à l'instant t (secondes) : l'orbe y glisse en douceur. */
export function orbTarget(state: OrbState, t: number): { amp: number; radius: number; speed: number } {
  switch (state) {
    case 'listening':
      return { amp: 1.4 + 0.25 * Math.sin(t * 5.2), radius: 0.68, speed: 0.9 };
    case 'thinking':
      return { amp: 1.15, radius: 0.62, speed: 0.5 };
    case 'speaking':
      return { amp: 1.4 + 0.3 * Math.sin(t * 8.4) * Math.sin(t * 2.3), radius: 0.72, speed: 0.7 };
    default:
      return { amp: 1, radius: 0.66, speed: 0.22 };
  }
}
