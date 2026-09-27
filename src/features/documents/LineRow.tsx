import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
      className="h-10 text-right tabular-nums"
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
    <div className="hidden grid-cols-[1fr_6.5rem_4.5rem_4.5rem_6.5rem_2.25rem] gap-2 border-b pb-1 text-xs text-muted-foreground md:grid">
      <span>Prestation / pièce</span>
      <span className="text-right">Prix unit. HT</span>
      <span className="text-right">Qté</span>
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
    <li className="grid grid-cols-[1fr_auto] gap-2 border-b py-3 last:border-0 md:grid-cols-[1fr_6.5rem_4.5rem_4.5rem_6.5rem_auto] md:items-start">
      <div className="space-y-1">
        <Textarea
          aria-label="Désignation"
          rows={isText ? 1 : 2}
          className={cn('min-h-10 text-base', isText && 'text-muted-foreground italic')}
          defaultValue={line.description}
          key={`${line.id}-${line.description}`}
          disabled={locked}
          placeholder={isText ? 'Texte libre (remarque, conditions…)' : 'Prestation / pièce'}
          onBlur={(event) => {
            if (event.target.value !== line.description) onSave({ description: event.target.value });
          }}
        />
        {label && (
          <Badge variant="secondary">
            {label}
            {line.line_type === 'labor' &&
              line.hours !== null &&
              line.hours !== undefined &&
              ` · ${decimalText(line.hours)} h`}
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="md:order-last"
        aria-label={`Supprimer ${line.description || 'la ligne'}`}
        disabled={locked || deleting}
        onClick={onDelete}
      >
        <Trash2 />
      </Button>
      {isText ? (
        <span className="hidden md:col-span-4 md:block" />
      ) : (
        <div className="col-span-2 grid grid-cols-4 items-center gap-2 md:col-span-4 md:grid-cols-[6.5rem_4.5rem_4.5rem_6.5rem]">
          <NumberCell line={line} field="unit_price" label="Prix unit. HT" locked={locked} onSave={onSave} />
          <NumberCell line={line} field="quantity" label="Quantité" locked={locked} onSave={onSave} />
          <NumberCell line={line} field="discount_percent" label="Remise %" locked={locked} onSave={onSave} />
          <span className="text-right font-semibold tabular-nums" aria-label="Net HT">
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
    <dl className="ml-auto w-full max-w-xs space-y-1 text-right text-sm" aria-label="Totaux">
      <div className="flex justify-between gap-4">
        <dt>Total HT</dt>
        <dd className="font-semibold tabular-nums">{formatEuro(totals.ht)}</dd>
      </div>
      {totals.rates.map(({ rate, amount }) => (
        <div key={rate} className="flex justify-between gap-4">
          <dt>TVA ({String(rate).replace('.', ',')} %)</dt>
          <dd className="tabular-nums">{formatEuro(amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t pt-1 text-base">
        <dt>Total TTC</dt>
        <dd className="font-bold tabular-nums">{formatEuro(totals.ttc)}</dd>
      </div>
    </dl>
  );
}
