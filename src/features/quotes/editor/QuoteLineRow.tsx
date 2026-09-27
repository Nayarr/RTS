import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { decimalText, formatEuro, parseDecimal } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { TablesUpdate } from '@/types/database';
import { deleteQuoteLine, updateQuoteLine, type QuoteLine } from '../api';
import { lineNet } from '../domain';
import { useQuoteMutation } from '../hooks';

const TYPE_LABELS: Partial<Record<QuoteLine['line_type'], string>> = {
  labor: 'Main d’œuvre',
  package: 'Forfait',
  part: 'Pièce',
};

type NumericField = 'unit_price' | 'quantity' | 'discount_percent';

/** Valeur saisie → valeur enregistrable (null = saisie refusée, on garde l'ancienne). */
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
  className,
}: {
  line: QuoteLine;
  field: NumericField;
  label: string;
  locked: boolean;
  onSave: (patch: TablesUpdate<'quote_lines'>) => void;
  className?: string;
}) {
  const current = line[field];
  return (
    <Input
      aria-label={label}
      inputMode="decimal"
      className={cn('h-10 text-right tabular-nums', className)}
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

/** Ligne du devis : enregistrée à la sortie de chaque champ (comme l'ancienne appli). */
export function QuoteLineRow({ line, locked }: { line: QuoteLine; locked: boolean }) {
  const update = useQuoteMutation(
    (patch: TablesUpdate<'quote_lines'>) => updateQuoteLine(line.id, patch),
    null,
  );
  const remove = useQuoteMutation(() => deleteQuoteLine(line.id), 'Ligne supprimée');
  const isText = line.line_type === 'text';
  const description = line.description || 'la ligne';

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
            if (event.target.value !== line.description) update.mutate({ description: event.target.value });
          }}
        />
        {TYPE_LABELS[line.line_type] && (
          <Badge variant="secondary">
            {TYPE_LABELS[line.line_type]}
            {line.line_type === 'labor' &&
              line.estimated_hours !== null &&
              ` · ${decimalText(line.estimated_hours)} h`}
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="md:order-last"
        aria-label={`Supprimer ${description}`}
        disabled={locked || remove.isPending}
        onClick={() => remove.mutate(undefined)}
      >
        <Trash2 />
      </Button>
      {isText ? (
        <span className="hidden md:col-span-4 md:block" />
      ) : (
        <div className="col-span-2 grid grid-cols-4 items-center gap-2 md:col-span-4 md:grid-cols-[6.5rem_4.5rem_4.5rem_6.5rem]">
          <NumberCell
            line={line}
            field="unit_price"
            label="Prix unit. HT"
            locked={locked}
            onSave={update.mutate}
          />
          <NumberCell line={line} field="quantity" label="Quantité" locked={locked} onSave={update.mutate} />
          <NumberCell
            line={line}
            field="discount_percent"
            label="Remise %"
            locked={locked}
            onSave={update.mutate}
          />
          <span className="text-right font-semibold tabular-nums" aria-label="Net HT">
            {formatEuro(lineNet(line))}
          </span>
        </div>
      )}
    </li>
  );
}
