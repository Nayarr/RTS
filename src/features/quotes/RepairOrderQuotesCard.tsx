import { Link, useNavigate } from 'react-router';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { RepairOrderOverview } from '@/features/repair-orders/api';
import { formatEuro } from '@/lib/numbers';
import { buildQuoteFromRepairOrder } from './api';
import { useQuoteMutation, useRepairOrderQuotes } from './hooks';
import { QuoteStatusBadge } from './QuoteStatusBadge';

/** Devis de l'OR : préparation (travaux de l'OR chiffrés) et suivi. */
export function RepairOrderQuotesCard({ order }: { order: RepairOrderOverview }) {
  const navigate = useNavigate();
  const quotes = useRepairOrderQuotes(order.id);
  const prepare = useQuoteMutation(async () => {
    const id = await buildQuoteFromRepairOrder(order.id);
    await navigate(`/devis/${id}`);
  }, null);

  const list = quotes.data ?? [];
  const hasOpenQuote = list.some((quote) => quote.status !== 'accepted' && quote.status !== 'refused');

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-xl font-bold">Devis</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {order.status === 'quote_pending'
              ? 'Le technicien a signalé des travaux à chiffrer.'
              : 'Aucun devis pour cet OR.'}
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((quote) => (
              <li key={quote.id} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/devis/${quote.id}`} className="font-medium hover:underline">
                  {quote.number ?? 'Devis sans numéro'}
                </Link>
                <span className="text-sm tabular-nums">{formatEuro(quote.total_ttc)}</span>
                <QuoteStatusBadge status={quote.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {order.status !== 'invoiced' && (
        <CardFooter>
          <Button
            variant={order.status === 'quote_pending' ? 'default' : 'outline'}
            disabled={prepare.isPending}
            onClick={() => prepare.mutate(undefined)}
          >
            <FileText /> {hasOpenQuote ? 'Reprendre le devis' : 'Préparer le devis'}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
