import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RoLine } from '../api';
import { formatHours } from '../constants';

const TYPE_LABELS: Partial<Record<RoLine['line_type'], string>> = { package: 'Forfait' };

function LineList({ lines, empty }: { lines: RoLine[]; empty: string }) {
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {lines.map((line) => (
        <li key={line.id} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="text-sm whitespace-pre-line">{line.description || <em>(sans description)</em>}</p>
            {TYPE_LABELS[line.line_type] && (
              <Badge variant="secondary" className="mt-1">
                {TYPE_LABELS[line.line_type]}
              </Badge>
            )}
          </div>
          <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
            {line.estimated_hours === null
              ? line.standard_hours === null
                ? '—'
                : `${formatHours(line.standard_hours)} (barème)`
              : `${formatHours(line.estimated_hours)}${line.estimate_is_minimum ? '+' : ''}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Travaux effectués et à prévoir (saisis par le technicien) ; les pièces ont leur propre carte. */
export function LinesCard({ lines: allLines }: { lines: RoLine[] }) {
  const lines = allLines.filter((line) => line.line_type !== 'part');
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Intervention atelier</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="mb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            Travaux effectués
          </h3>
          <LineList lines={lines.filter((line) => line.kind === 'done')} empty="Aucun travail déclaré." />
        </section>
        <section>
          <h3 className="mb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            À prévoir (devis)
          </h3>
          <LineList
            lines={lines.filter((line) => line.kind === 'planned')}
            empty="Rien à prévoir pour l’instant."
          />
        </section>
      </CardContent>
    </Card>
  );
}
