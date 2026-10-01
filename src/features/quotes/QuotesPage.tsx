import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, normalizeKey } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import { useIsDesktop } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import type { QuoteOverview, QuoteStatus } from './api';
import { QUOTE_STATUS_META, QUOTE_STATUS_ORDER } from './domain';
import { useQuotes } from './hooks';
import { QuoteStatusBadge } from './QuoteStatusBadge';

type Filter = 'open' | 'all' | QuoteStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'En attente de réponse' },
  ...QUOTE_STATUS_ORDER.map((status) => ({ value: status, label: QUOTE_STATUS_META[status].label })),
  { value: 'all', label: 'Tous' },
];

function matchesFilter(quote: QuoteOverview, filter: Filter) {
  if (filter === 'open') return quote.status !== 'accepted' && quote.status !== 'refused';
  if (filter === 'all') return true;
  return quote.status === filter;
}

function matchesSearch(quote: QuoteOverview, search: string) {
  if (!search) return true;
  const text = search.toLowerCase();
  const key = normalizeKey(search);
  return (
    (key.length > 0 && normalizeKey(quote.plate ?? '').includes(key)) ||
    (quote.number ?? '').toLowerCase().includes(text) ||
    (quote.client_name ?? '').toLowerCase().includes(text) ||
    (quote.repair_order_number ?? '').toLowerCase().includes(text)
  );
}

/** Liste des devis : réponses à obtenir, acceptés à transformer en OR. */
export function QuotesPage() {
  const quotes = useQuotes();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(
    () => FILTERS.find(({ value }) => value === params.get('filtre'))?.value ?? 'open',
  );
  const [search, setSearch] = useState('');

  const list = useMemo(
    () => (quotes.data ?? []).filter((q) => matchesFilter(q, filter) && matchesSearch(q, search.trim())),
    [quotes.data, filter, search],
  );
  const counts = useMemo(() => {
    const all = quotes.data ?? [];
    return Object.fromEntries(
      FILTERS.map(({ value }) => [value, all.filter((q) => matchesFilter(q, value)).length]),
    );
  }, [quotes.data]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Devis</h1>
          <p className="text-muted-foreground">Devis des OR et demandes de prix.</p>
        </div>
        <Button size="lg" asChild>
          <Link to="/devis/nouveau">
            <Plus /> Nouveau devis
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Rechercher un devis"
            placeholder="Plaque, client, n° de devis ou d’OR…"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div role="group" aria-label="Filtrer par statut" className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium whitespace-nowrap transition',
                filter === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {label} <span className="opacity-70">{counts[value] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {quotes.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {quotes.isError && <p className="text-destructive">Impossible de charger les devis.</p>}
      {quotes.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun devis ne correspond.
        </p>
      )}

      {list.length > 0 &&
        (isDesktop ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Devis</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead>Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((quote) => (
                  <TableRow
                    key={quote.id}
                    className="cursor-pointer"
                    onClick={() => void navigate(`/devis/${quote.id}`)}
                  >
                    <TableCell>
                      <Link to={`/devis/${quote.id}`} className="font-semibold hover:underline">
                        {quote.number ?? 'Sans numéro'}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {quote.repair_order_number ? `OR ${quote.repair_order_number}` : 'Sans OR'}
                      </div>
                    </TableCell>
                    <TableCell>{quote.client_name ?? '—'}</TableCell>
                    <TableCell>{quote.plate ?? '—'}</TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={quote.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuro(quote.total_ttc)}</TableCell>
                    <TableCell>{formatDate(quote.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((quote) => (
              <li key={quote.id}>
                <Link
                  to={`/devis/${quote.id}`}
                  className="block rounded-lg border bg-card p-4 transition hover:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-bold">{quote.number ?? 'Sans numéro'}</div>
                      <div className="text-sm text-muted-foreground">
                        {quote.client_name ?? '—'} · {quote.plate ?? 'sans véhicule'}
                      </div>
                    </div>
                    <QuoteStatusBadge status={quote.status} />
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">{formatDate(quote.created_at)}</span>
                    <span className="font-semibold tabular-nums">{formatEuro(quote.total_ttc)} TTC</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
