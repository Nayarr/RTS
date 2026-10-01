import { Link, useNavigate } from 'react-router';
import { FileText, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { buildQuoteFromRepairOrder } from './api';
import { useQuoteMutation, useRepairOrderQuotes } from './hooks';
import { QuoteStatusBadge } from './QuoteStatusBadge';

/** « Préparer le devis » (ou le reprendre) : travaux de l'OR chiffrés dans un devis. */
export function PrepareQuoteButton({
  order,
  variant,
  className,
}: {
  order: RepairOrderOverview;
  variant?: 'default' | 'outline';
  className?: string;
}) {
  const navigate = useNavigate();
  const quotes = useRepairOrderQuotes(order.id);
  const prepare = useQuoteMutation(async () => {
    const id = await buildQuoteFromRepairOrder(order.id);
    await navigate(`/devis/${id}`);
  }, null);
  const hasOpenQuote = (quotes.data ?? []).some(
    (quote) => quote.status !== 'accepted' && quote.status !== 'refused',
  );
  return (
    <Button
      variant={variant ?? (order.status === 'quote_pending' ? 'default' : 'outline')}
      className={className}
      disabled={prepare.isPending}
      onClick={() => prepare.mutate(undefined)}
    >
      <FileText /> {hasOpenQuote ? 'Reprendre le devis' : 'Préparer le devis'}
    </Button>
  );
}

/** Devis de l'OR : préparation (travaux de l'OR chiffrés) et suivi. */
export function RepairOrderQuotesCard({ order }: { order: RepairOrderOverview }) {
  const quotes = useRepairOrderQuotes(order.id);
  const list = quotes.data ?? [];

  return (
    <section data-slot="card" className="card" aria-labelledby="ro-quotes">
      <div className="card-h">
        <h2 className="h2" id="ro-quotes">
          Devis
        </h2>
      </div>
      <div className="card-b col gap-3">
        {list.length === 0 ? (
          order.status === 'quote_pending' ? (
            <div className="alert s-orange px-3 py-2.5">
              <MessageSquareWarning className="i" />
              <span>Le technicien a signalé des travaux à chiffrer.</span>
            </div>
          ) : (
            <p className="muted">Aucun devis pour cet OR.</p>
          )
        ) : (
          <ul>
            {list.map((quote) => (
              <li key={quote.id} className="row between gap-2 border-b py-2 last:border-b-0">
                <Link to={`/devis/${quote.id}`} className="b ul">
                  {quote.number ?? 'Devis sans numéro'}
                </Link>
                <span className="num text-[13px]">{formatEuro(quote.total_ttc)}</span>
                <QuoteStatusBadge status={quote.status} />
              </li>
            ))}
          </ul>
        )}
        {order.status !== 'invoiced' && <PrepareQuoteButton order={order} className={cn('w-full')} />}
      </div>
    </section>
  );
}
