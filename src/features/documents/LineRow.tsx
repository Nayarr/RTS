import { Fragment } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { decimalText, formatEuro, parseDecimal } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { lineNet, type EditableLine, type LineType } from './lines';

const TYPE_LABELS: Partial<Record<LineType, string>> = {
  labor: 'Main d’œuvre',
  package: 'Forfait',
  part: 'Pièce',
  subcontract: 'Sous-traitance',
  consumable: 'Consommable',
  travel: 'Déplacement',
};

/** Champ intégré au tableau (maquette) : sans bord, le bord apparaît au survol. */
const INLINE_INPUT =
  'h-[34px] rounded-lg border-transparent bg-transparent px-2 hover:border-input focus-visible:border-ring disabled:opacity-100';

type NumericField = 'unit_price' | 'quantity' | 'discount_percent';
export type LinePatch = Partial<Pick<EditableLine, 'description' | NumericField>>;

/** Valeur saisie → valeur enregistrable (undefined = saisie refusée, on garde l'ancienne). */
function parseField(field: NumericField, text: string): number | null | undefined {
  const value = parseDecimal(text);
  if (value === null) return field === 'unit_price' ? null : field === 'discount_percent' ? 0 : undefined;
  if (Number.isNaN(value)) return undefined;
  if (field === 'quantity' && value <= 0) return undefined;
  if (field === 'discount_percent' && value > 100) return undefined;
  return Math.round(value * 100) / 100;
}

function NumberCell({
  line,
  field,
  label,
  locked,
  onSave,
}: {
  line: EditableLine;
  field: NumericField;
  label: string;
  locked: boolean;
  onSave: (patch: LinePatch) => void;
}) {
  const current = line[field];
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className={INLINE_INPUT + ' text-right tabular-nums'}
      defaultValue={field === 'discount_percent' && current === 0 ? '' : decimalText(current)}
      placeholder={field === 'discount_percent' ? '0' : undefined}
      key={`${line.id}-${field}-${String(current)}`}
      disabled={locked}
      onBlur={(event) => {
        const value = parseField(field, event.target.value);
        if (value === undefined) {
          event.target.value = decimalText(current);
          return;
        }
        if (value !== current) onSave({ [field]: value });
      }}
    />
  );
}

/** En-têtes de colonnes (écran large), alignés sur `LineRow`. */
export function LineColumns() {
  return (
    <div className="hidden h-[42px] grid-cols-[1fr_5rem_7.5rem_5.5rem_7rem_2.25rem] items-center gap-2 border-y bg-head px-6 text-[12.5px] font-semibold text-muted-foreground md:grid">
      <span>Prestation / pièce</span>
      <span className="text-right">Qté</span>
      <span className="text-right">Prix unit. HT</span>
      <span className="text-right">Remise %</span>
      <span className="text-right">Net HT</span>
    </div>
  );
}

/** Ligne d'un devis ou d'une facture : enregistrée à la sortie de chaque champ (comme l'ancienne appli). */
export function LineRow({
  line,
  locked,
  onSave,
  onDelete,
  deleting = false,
}: {
  line: EditableLine;
  locked: boolean;
  onSave: (patch: LinePatch) => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const isText = line.line_type === 'text';
  const label = TYPE_LABELS[line.line_type];

  return (
    <li className="grid grid-cols-[1fr_auto] items-center gap-2 border-b px-4 py-2 last:border-0 md:grid-cols-[1fr_5rem_7.5rem_5.5rem_7rem_2.25rem] md:px-6">
      <div className="flex min-w-0 items-start gap-2">
        {label && (
          <span className="tag mt-1.5 shrink-0">
            {label}
            {line.line_type === 'labor' &&
              line.hours !== null &&
              line.hours !== undefined &&
              ` · ${decimalText(line.hours)} h`}
          </span>
        )}
        <Textarea
          aria-label="Désignation"
          rows={1}
          className={cn(
            INLINE_INPUT,
            'field-sizing-content h-auto min-h-[34px] resize-none py-1.5 leading-snug',
            isText && 'text-muted-foreground italic',
          )}
          defaultValue={line.description}
          key={`${line.id}-${line.description}`}
          disabled={locked}
          placeholder={isText ? 'Texte libre (remarque, conditions…)' : 'Prestation / pièce'}
          onBlur={(event) => {
            if (event.target.value !== line.description) onSave({ description: event.target.value });
          }}
        />
      </div>
      <button
        type="button"
        className="ibtn sm ghost md:order-last"
        aria-label={`Supprimer ${line.description || 'la ligne'}`}
        disabled={locked || deleting}
        onClick={onDelete}
      >
        <Trash2 className="i s" />
      </button>
      {isText ? (
        <span className="hidden md:col-span-4 md:block" />
      ) : (
        <div className="col-span-2 grid grid-cols-4 items-center gap-2 md:col-span-4 md:grid-cols-[5rem_7.5rem_5.5rem_7rem]">
          <NumberCell line={line} field="quantity" label="Quantité" locked={locked} onSave={onSave} />
          <NumberCell line={line} field="unit_price" label="Prix unit. HT" locked={locked} onSave={onSave} />
          <NumberCell line={line} field="discount_percent" label="Remise %" locked={locked} onSave={onSave} />
          <span className="num b text-right" aria-label="Net HT">
            {formatEuro(lineNet(line))}
          </span>
        </div>
      )}
    </li>
  );
}

/** Totaux HT, TVA par taux, TTC. */
export function TotalsList({
  totals,
}: {
  totals: { ht: number; ttc: number; rates: { rate: number; amount: number }[] };
}) {
  return (
    <dl
      className="ml-auto grid w-full max-w-[280px] grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2.5 text-right"
      aria-label="Totaux"
    >
      <dt className="muted">Total HT</dt>
      <dd className="num">{formatEuro(totals.ht)}</dd>
      {totals.rates.map(({ rate, amount }) => (
        <Fragment key={rate}>
          <dt className="muted">TVA ({String(rate).replace('.', ',')} %)</dt>
          <dd className="num">{formatEuro(amount)}</dd>
        </Fragment>
      ))}
      <dt className="b text-base">Total TTC</dt>
      <dd className="num disp text-2xl font-bold">{formatEuro(totals.ttc)}</dd>
    </dl>
  );
}
