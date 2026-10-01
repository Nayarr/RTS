import { compactAmount } from './domain';

export interface ChartBar {
  key: string;
  label: string;
  /** Valeur affichée au-dessus de la barre (vide : rien). */
  valueLabel: string;
  title: string;
  /** Segments empilés, du bas vers le haut. */
  segments: { value: number; fill: string }[];
}

/**
 * Histogramme de la maquette (SVG) : grille horizontale, graduations « 40k », barres arrondies,
 * libellé sous chaque barre et valeur au-dessus.
 */
export function BarChart({
  bars,
  label,
  height = 250,
  barWidth = 48,
}: {
  bars: ChartBar[];
  label: string;
  height?: number;
  barWidth?: number;
}) {
  const width = 1060;
  const left = 44;
  const top = 20;
  const bottom = height - 50;
  const totals = bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0));
  const max = Math.max(1, ...totals);
  const ticks = [1, 2 / 3, 1 / 3, 0];
  const slot = (width - left) / Math.max(1, bars.length);
  const scale = (value: number) => (value / max) * (bottom - top);

  return (
    <figure aria-label={label} className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full [&_text]:fill-muted-foreground [&_text]:font-sans [&_text]:text-[11.5px]"
        role="img"
        aria-hidden
      >
        <g stroke="var(--border)">
          {ticks.map((ratio) => {
            const y = bottom - ratio * (bottom - top);
            return <line key={ratio} x1={left} y1={y} x2={width} y2={y} />;
          })}
        </g>
        {ticks.map((ratio) => (
          <text key={ratio} x="0" y={bottom - ratio * (bottom - top) + 4}>
            {ratio === 0 ? '0' : compactAmount(max * ratio)}
          </text>
        ))}
        {bars.map((bar, index) => {
          const x = left + index * slot + (slot - barWidth) / 2;
          let y = bottom;
          return (
            <g key={bar.key}>
              <title>{bar.title}</title>
              {bar.segments.map((segment, segmentIndex) => {
                const h = scale(segment.value);
                y -= h;
                return h > 0 ? (
                  <rect
                    key={segmentIndex}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    rx="4"
                    style={{ fill: segment.fill }}
                  />
                ) : null;
              })}
              <text x={x + barWidth / 2} y={bottom + 24} textAnchor="middle">
                {bar.label}
              </text>
              {bar.valueLabel && (
                <text
                  x={x + barWidth / 2}
                  y={bottom - scale(totals[index] ?? 0) - 6}
                  textAnchor="middle"
                  className="fill-foreground! font-semibold"
                >
                  {bar.valueLabel}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
