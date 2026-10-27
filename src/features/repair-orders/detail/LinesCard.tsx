import { formatEuro, formatQuantity } from '@/lib/numbers';
import type { RoLine } from '../api';
import { formatHours } from '../constants';

const TYPE_LABELS: Partial<Record<RoLine['line_type'], string>> = { package: 'Forfait' };

/** Où va la ligne : forfaits des pneus au devis seulement, remplacement des pneus à l'atelier seulement. */
const VISIBILITY_LABELS: Partial<Record<string, string>> = {
  quote: 'Devis et facture seulement',
  workshop: 'Atelier seulement (pas au devis)',
};

/** Temps de la ligne ; forfait au devis seulement (pneus) : son prix, son temps ne compte pas. */
function lineAmount(line: RoLine) {
  if (line.visibility === 'quote' && line.unit_price !== null) {
    return `${formatQuantity(line.quantity)} × ${formatEuro(line.unit_price)} HT`;
  }
  if (line.estimated_hours === null) {
    return line.standard_hours === null || line.kind === 'done'
      ? '-'
      : `${formatHours(line.standard_hours)} (barème)`;
  }
  return `${formatHours(line.estimated_hours)}${line.estimate_is_minimum ? '+' : ''}${
    line.kind === 'done' ? ' réel' : ''
  }`;
}

function LineList({ lines, empty }: { lines: RoLine[]; empty: string }) {
  if (lines.length === 0) return <p className="hint py-2.5">{empty}</p>;
  return (
    <ul>
      {lines.map((line) => (
        <li key={line.id} className="row between top border-b py-2.5 last:border-b-0">
          <span className="col min-w-0 gap-1">
            <span className="whitespace-pre-line">{line.description || <em>(sans description)</em>}</span>
            {(TYPE_LABELS[line.line_type] ?? VISIBILITY_LABELS[line.visibility]) && (
              <span className="row gap-1.5">
                {TYPE_LABELS[line.line_type] && (
                  <span className="tag self-start">{TYPE_LABELS[line.line_type]}</span>
                )}
                {VISIBILITY_LABELS[line.visibility] && (
                  <span className="tag self-start">{VISIBILITY_LABELS[line.visibility]}</span>
                )}
              </span>
            )}
          </span>
          <span className="col shrink-0 items-end gap-0.5">
            <span className="muted num">{lineAmount(line)}</span>
            {line.kind === 'done' && line.billed_hours !== null && line.visibility !== 'quote' && (
              <span className="hint num">facturé {formatHours(line.billed_hours)}</span>
            )}
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
    <section data-slot="card" className="card" aria-labelledby="ro-lines">
      <div className="card-h">
        <h2 className="h2" id="ro-lines">
          Intervention atelier
        </h2>
        <span className="muted text-[13px]">Saisie par le technicien</span>
      </div>
      <div className="card-b grid gap-7 md:grid-cols-2">
        <section className="col gap-1">
          <h3 className="overline">Travaux effectués</h3>
          <LineList lines={lines.filter((line) => line.kind === 'done')} empty="Aucun travail déclaré." />
        </section>
        <section className="col gap-1">
          <h3 className="overline">À prévoir (devis)</h3>
          <LineList
            lines={lines.filter((line) => line.kind === 'planned')}
            empty="Rien à prévoir pour l’instant."
          />
        </section>
      </div>
    </section>
  );
}
