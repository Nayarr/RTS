import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { marginPercent, saleFromMargin } from '@/lib/margin';
import { decimalText, decimalValue, formatEuro } from '@/lib/numbers';

/**
 * Marge en % liée aux prix : calculée depuis le prix de vente et le prix d'achat ; modifiée, elle
 * recalcule le prix de vente HT (et le total quand la quantité est connue).
 */
export function MarginField({
  id,
  purchase,
  sale,
  onSale,
  quantity,
}: {
  id: string;
  /** Prix d'achat HT saisi (texte du formulaire). */
  purchase: string;
  /** Prix de vente HT saisi (texte du formulaire). */
  sale: string;
  onSale: (sale: string) => void;
  /** Quantité saisie : affiche le total HT de la ligne. */
  quantity?: string;
}) {
  const purchaseValue = decimalValue(purchase);
  const saleValue = decimalValue(sale);
  const computed = marginPercent(purchaseValue, saleValue);
  // Saisie en cours : gardée telle quelle (« 3 », « 33, »…) jusqu'à la sortie du champ
  const [draft, setDraft] = useState<string | null>(null);
  const quantityValue = quantity === undefined ? null : decimalValue(quantity);
  const total = saleValue !== null && quantityValue !== null ? saleValue * quantityValue : null;

  return (
    <>
      <div className="field">
        <Label htmlFor={id}>Marge (%)</Label>
        <Input
          id={id}
          inputMode="decimal"
          className="num"
          placeholder={purchaseValue === null ? 'Prix d’achat d’abord' : 'Ex : 30'}
          disabled={purchaseValue === null || purchaseValue <= 0}
          value={draft ?? (computed === null ? '' : decimalText(computed))}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = saleFromMargin(purchaseValue, decimalValue(event.target.value));
            if (next !== null) onSale(decimalText(next));
          }}
          onBlur={() => setDraft(null)}
        />
        <span className="hint">Sur le prix d’achat : (vente − achat) / achat.</span>
      </div>
      {quantity !== undefined && (
        <div className="field">
          <span className="text-sm font-medium">Total HT</span>
          <output
            aria-label="Total HT de la ligne"
            className="num flex h-10 items-center text-lg font-semibold"
          >
            {total === null ? '-' : formatEuro(Math.round(total * 100) / 100)}
          </output>
        </div>
      )}
    </>
  );
}
