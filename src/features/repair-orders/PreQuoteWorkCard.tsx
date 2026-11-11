import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Gift } from 'lucide-react';
import { toast } from 'sonner';
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
  choiceHint,
  choiceOptions,
  choicePrice,
  defaultChoice,
  fetchPreQuoteWork,
  hasOfferedHour,
  lineTitle,
  preQuoteWorkKey,
  settlementMessage,
  settlePreQuoteWork,
  toDecision,
  type PreQuoteChoiceKind,
  type PreQuoteWork,
} from './pre-quote-work';

const errorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Enregistrement impossible';

function DecisionDialog({ work, onClose }: { work: PreQuoteWork; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const priceText = (value: number) => Number(value).toFixed(2).replace('.', ',');
  // 1re heure offerte par défaut ; chaque ligne reste au choix (facturer tout, offrir).
  const [choices, setChoices] = useState<Record<string, PreQuoteChoiceKind>>(() =>
    Object.fromEntries(work.lines.map((line) => [line.id, defaultChoice(work, line)])),
  );
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      work.lines.map((line) => [line.id, priceText(choicePrice(work, line, defaultChoice(work, line)))]),
    ),
  );
  const missingPrice = work.lines.some(
    (line) => choices[line.id] !== 'offered' && (parseDecimal(prices[line.id] ?? '') ?? 0) <= 0,
  );
  const choose = (entries: [string, PreQuoteChoiceKind][]) => {
    const byId = new Map(work.lines.map((line) => [line.id, line]));
    setChoices((current) => ({ ...current, ...Object.fromEntries(entries) }));
    // Prix proposé du nouveau choix : la part facturée ou la ligne entière.
    setPrices((current) => ({
      ...current,
      ...Object.fromEntries(
        entries.map(([id, choice]) => {
          const line = byId.get(id);
          return [id, line ? priceText(choicePrice(work, line, choice)) : (current[id] ?? '')];
        }),
      ),
    }));
  };

  const settle = useMutation({
    mutationFn: () =>
      settlePreQuoteWork(
        work.repair_order_id,
        work.lines.map((line) => ({
          line_id: line.id,
          ...toDecision(choices[line.id] ?? defaultChoice(work, line)),
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
      // Facture émise : ouverte et envoyée tout de suite au client.
      if (result.invoice_id) await navigate(`/factures/${result.invoice_id}?envoyer=1`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  // « Tout facturer » : la règle par défaut (1re heure offerte, le reste facturé) ; « Tout offrir » : tout.
  const billAll = () => choose(work.lines.map((line) => [line.id, defaultChoice(work, line)]));
  const offerAll = () => choose(work.lines.map((line) => [line.id, 'offered']));
  const hours = formatQuantity(work.expertise_hours);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Travaux réalisés avant le devis</DialogTitle>
          <DialogDescription>
            Le devis {work.quote_number ?? ''} est accepté. Pour chaque travail déjà fait sur l’OR{' '}
            {work.repair_order_number} (diagnostic, contrôle…), choisis de le <strong>facturer</strong> ou de
            l’<strong>offrir</strong> à titre commercial. La facture part ensuite au client, avec les travaux
            offerts. Le prix proposé est modifiable.
          </DialogDescription>
        </DialogHeader>

        {work.expertise_hours > 0 && (
          <p className="alert s-blue" role="note">
            {work.first_hour_offered
              ? `Expertise de ${hours} h : la première heure est offerte par défaut, elle figure sur la facture avec 100 % de remise. Tu peux la repasser en payante ou offrir d’autres lignes.`
              : `Expertise de ${hours} h (1 h ou moins) : à toi de choisir de l’offrir ou de la facturer.`}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={billAll}>
            Tout facturer
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={offerAll}>
            Tout offrir
          </Button>
        </div>

        <ul className="divide-y" aria-label="Travaux réalisés avant le devis">
          {work.lines.map((line) => {
            const title = lineTitle(line.description);
            const choice = choices[line.id] ?? defaultChoice(work, line);
            const withHour = hasOfferedHour(work, line);
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
                {withHour && <p className="hint">{choiceHint(line, choice)}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Décision pour « ${title} »`}
                    className="inp w-auto min-w-44 flex-1"
                    value={choice}
                    onChange={(event) => choose([[line.id, event.target.value as PreQuoteChoiceKind]])}
                  >
                    {choiceOptions(work, line).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {choice !== 'offered' && (
                    <>
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
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">
          Les lignes offertes figurent sur la facture avec une remise de 100 % et la mention « Geste
          commercial », pour que le client voie ce qui lui est offert. Tout offert : facture à 0 €.
        </p>
        {missingPrice && (
          <p className="text-sm text-destructive">Indique un prix pour chaque ligne à facturer.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Plus tard
          </Button>
          <Button disabled={missingPrice || settle.isPending} onClick={() => settle.mutate()}>
            Valider et envoyer la facture
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
      <section data-slot="card" className="card" aria-labelledby="pre-quote-work">
        <div className="card-h flex-wrap">
          <h2 className="h2" id="pre-quote-work">
            <Gift className="i" /> Travaux réalisés avant le devis
          </h2>
          <span className="hint">
            Devis {work.data.quote_number ?? ''} accepté : choisis ce que tu factures et ce que tu offres.
          </span>
        </div>
        <ul>
          {work.data.lines.map((line) => (
            <li key={line.id} className="li">
              <span className="b grow">{lineTitle(line.description)}</span>
              {line.hours ? <span className="muted num">{formatQuantity(line.hours)} h</span> : null}
            </li>
          ))}
        </ul>
        <div className="tfoot justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            Facturer / offrir ces travaux
          </Button>
        </div>
      </section>
      {open && <DecisionDialog work={work.data} onClose={() => setOpen(false)} />}
    </>
  );
}
