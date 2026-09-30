import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { invoicesKey } from '@/features/invoices/hooks';
import { quotesKey } from '@/features/quotes/hooks';
import { formatQuantity, parseDecimal } from '@/lib/numbers';
import { repairOrdersKey } from './hooks';
import {
  fetchPreQuoteWork,
  lineTitle,
  preQuoteWorkKey,
  settlementMessage,
  settlePreQuoteWork,
  type PreQuoteDecision,
  type PreQuoteWork,
} from './pre-quote-work';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Enregistrement impossible';

function DecisionDialog({ work, onClose }: { work: PreQuoteWork; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<Record<string, PreQuoteDecision>>(() =>
    Object.fromEntries(work.lines.map((line) => [line.id, 'billed'])),
  );
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      work.lines.map((line) => [line.id, Number(line.suggested_price).toFixed(2).replace('.', ',')]),
    ),
  );
  const missingPrice = work.lines.some(
    (line) => decisions[line.id] === 'billed' && (parseDecimal(prices[line.id] ?? '') ?? 0) <= 0,
  );

  const settle = useMutation({
    mutationFn: () =>
      settlePreQuoteWork(
        work.repair_order_id,
        work.lines.map((line) => ({
          line_id: line.id,
          decision: decisions[line.id] ?? 'billed',
          price: parseDecimal(prices[line.id] ?? ''),
        })),
      ),
    onSuccess: async (result) => {
      toast.success(settlementMessage(result));
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: preQuoteWorkKey(work.repair_order_id) }),
        queryClient.invalidateQueries({ queryKey: repairOrdersKey }),
        queryClient.invalidateQueries({ queryKey: quotesKey }),
        queryClient.invalidateQueries({ queryKey: invoicesKey }),
      ]);
      // Facture émise : on l'ouvre pour l'imprimer ou l'envoyer au client.
      if (result.invoice_id) await navigate(`/factures/${result.invoice_id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setAll = (decision: PreQuoteDecision) =>
    setDecisions(Object.fromEntries(work.lines.map((line) => [line.id, decision])));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Travaux réalisés avant le devis</DialogTitle>
          <DialogDescription>
            Le devis {work.quote_number ?? ''} est accepté. Pour chaque travail déjà fait sur l’OR{' '}
            {work.repair_order_number} (diagnostic, contrôle…), choisis de le <strong>facturer</strong>{' '}
            (facture séparée, émise maintenant) ou de l’<strong>offrir</strong> à titre commercial. Le prix
            proposé est modifiable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAll('billed')}>
            Tout facturer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAll('offered')}>
            Tout offrir
          </Button>
        </div>

        <ul className="divide-y" aria-label="Travaux réalisés avant le devis">
          {work.lines.map((line) => {
            const title = lineTitle(line.description);
            return (
              <li key={line.id} className="space-y-2 py-3">
                <p className="font-semibold">
                  {title}
                  {line.hours ? (
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      ({formatQuantity(line.hours)} h)
                    </span>
                  ) : null}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Décision pour « ${title} »`}
                    className="h-10 min-w-44 flex-1 rounded-md border bg-transparent px-3"
                    value={decisions[line.id]}
                    onChange={(event) =>
                      setDecisions((current) => ({
                        ...current,
                        [line.id]: event.target.value as PreQuoteDecision,
                      }))
                    }
                  >
                    <option value="billed">Facturer</option>
                    <option value="offered">Offrir (geste commercial)</option>
                  </select>
                  <Input
                    aria-label={`Prix HT de « ${title} »`}
                    inputMode="decimal"
                    className="h-10 w-28 text-right"
                    value={prices[line.id] ?? ''}
                    onChange={(event) =>
                      setPrices((current) => ({ ...current, [line.id]: event.target.value }))
                    }
                  />
                  <span className="text-sm">€ HT</span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">
          Les lignes offertes figurent sur la facture avec une remise de 100 %, pour que le client voie le
          geste commercial. Si tout est offert, aucune facture n’est émise.
        </p>
        {missingPrice && (
          <p className="text-sm text-destructive">Indique un prix pour chaque ligne à facturer.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Plus tard
          </Button>
          <Button disabled={missingPrice || settle.isPending} onClick={() => settle.mutate()}>
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Bandeau affiché tant que les travaux réalisés avant le devis ne sont ni facturés ni
 * offerts. `autoOpen` ouvre la décision tout de suite (devis qui vient d'être accepté).
 */
export function PreQuoteWorkCard({
  repairOrderId,
  autoOpen = false,
}: {
  repairOrderId: string;
  autoOpen?: boolean;
}) {
  const work = useQuery({
    queryKey: preQuoteWorkKey(repairOrderId),
    queryFn: () => fetchPreQuoteWork(repairOrderId),
  });
  const [open, setOpen] = useState(autoOpen);

  if (!work.data) return null;
  return (
    <>
      <Alert className="border-2 border-amber-500">
        <Gift />
        <AlertTitle>Travaux réalisés avant le devis</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            Le devis {work.data.quote_number ?? ''} est accepté : choisis ce que tu factures et ce que tu
            offres sur les travaux déjà effectués ({work.data.lines.length} ligne
            {work.data.lines.length > 1 ? 's' : ''}).
          </p>
          <Button onClick={() => setOpen(true)}>Facturer / offrir ces travaux</Button>
        </AlertDescription>
      </Alert>
      {open && <DecisionDialog work={work.data} onClose={() => setOpen(false)} />}
    </>
  );
}
