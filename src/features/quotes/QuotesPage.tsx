import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ChevronRight, CircleCheck, FileText, Percent, Plus, Send } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips, Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { formatDate, normalizeKey } from '@/features/repair-orders/constants';
import { formatEuro } from '@/lib/numbers';
import { useIsDesktop } from '@/lib/use-media-query';
import { usePagination } from '@/lib/use-pagination';
import { addDays } from '@/features/planning/domain';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import type { QuoteOverview, QuoteStatus } from './api';
import { QUOTE_STATUS_META, QUOTE_STATUS_ORDER } from './domain';
import { useQuotes } from './hooks';
import { QuoteStatusBadge } from './QuoteStatusBadge';

type Filter = 'all' | 'no_order' | QuoteStatus;

const FILTERS: { value: Filter; label: string; color?: string }[] = [
  { value: 'all', label: 'Tous' },
  ...QUOTE_STATUS_ORDER.map((status) => ({
    value: status,
    label: status === 'sent' ? 'Devis envoyés' : QUOTE_STATUS_META[status].label,
    color: QUOTE_STATUS_META[status].color,
  })),
  { value: 'no_order', label: 'Sans OR' },
];

const PAGE_SIZE = 20;

function matchesFilter(quote: QuoteOverview, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'no_order') return !quote.repair_order_number;
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
    () => FILTERS.find(({ value }) => value === params.get('filtre'))?.value ?? 'all',
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

  const all = quotes.data ?? [];
  const sent = all.filter((quote) => quote.status === 'sent');
  const since = addDays(todayIso(), -90);
  const decided = all.filter(
    (quote) =>
      (quote.status === 'accepted' || quote.status === 'refused') && quote.created_at.slice(0, 10) >= since,
  );
  const rate = decided.length
    ? Math.round((decided.filter((quote) => quote.status === 'accepted').length / decided.length) * 100)
    : null;
  const kpis = [
    {
      icon: <FileText className="i s" />,
      value: String(all.filter((q) => q.status === 'draft' || q.status === 'in_progress').length),
      label: 'À faire / en cours',
    },
    {
      icon: <Send className="i s" />,
      value: String(sent.length),
      label: `En attente de réponse · ${formatEuro(sent.reduce((sum, q) => sum + (q.total_ttc ?? 0), 0))} TTC`,
    },
    {
      icon: <CircleCheck className="i s" />,
      value: String(all.filter((q) => q.status === 'accepted' && !q.repair_order_number).length),
      label: 'Acceptés à transformer en OR',
      tone: 'up',
    },
    {
      icon: <Percent className="i s" />,
      value: rate === null ? '-' : `${rate} %`,
      label: 'Taux d’acceptation (90 j)',
    },
  ];
  const pages = usePagination(list, PAGE_SIZE, `${filter}|${search}`);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Facturation' }, { label: 'Devis' }]}
        title="Devis"
        actions={
          <>
            <span className="sub hidden md:inline">Devis des OR et demandes de prix</span>
            <Button asChild>
              <Link to="/devis/nouveau">
                <Plus /> Nouveau devis
              </Link>
            </Button>
          </>
        }
      />

      {quotes.isSuccess && (
        <ul className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <li key={kpi.label} className="card kpi flex-row items-center">
              <span className={cn('kpi-ico', kpi.tone)}>{kpi.icon}</span>
              <div className="col gap-0.5">
                <span className="kpi-v">{kpi.value}</span>
                <span className="kpi-l">{kpi.label}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <SearchField
            className="sm:w-[380px]"
            aria-label="Rechercher un devis"
            placeholder="Plaque, client, n° de devis ou d’OR…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterChips
            label="Filtrer par statut"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
          />
        </div>

        {quotes.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {quotes.isError && <p className="text-destructive">Impossible de charger les devis.</p>}
        {quotes.isSuccess && list.length === 0 && <p className="empty">Aucun devis ne correspond.</p>}

        {list.length > 0 &&
          (isDesktop ? (
            <div className="card tbl-wrap overflow-x-auto!">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Devis</th>
                    <th>Véhicule</th>
                    <th>Client</th>
                    <th>Statut</th>
                    <th className="r">Total TTC</th>
                    <th>Créé le</th>
                    <th className="w-12">
                      <span className="sr-only">Ouvrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.items.map((quote) => (
                    <tr
                      key={quote.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/devis/${quote.id}`)}
                    >
                      <td>
                        <Link to={`/devis/${quote.id}`} className="c2">
                          <b>{quote.number ?? 'Sans numéro'}</b>
                          <span>
                            {quote.repair_order_number ? `OR ${quote.repair_order_number}` : 'Sans OR'}
                          </span>
                        </Link>
                      </td>
                      <td>
                        {quote.plate ? (
                          <span className="plate">{quote.plate}</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td>{quote.client_name ?? '-'}</td>
                      <td>
                        <QuoteStatusBadge status={quote.status} />
                      </td>
                      <td className="r num b">{formatEuro(quote.total_ttc)}</td>
                      <td className="num">{formatDate(quote.created_at)}</td>
                      <td>
                        <Link
                          to={`/devis/${quote.id}`}
                          className="ibtn sm ghost"
                          aria-label={`Ouvrir le devis ${quote.number ?? ''}`}
                          tabIndex={-1}
                        >
                          <ChevronRight className="i s" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TableFooterBar
                pager={<Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />}
              >
                {pages.shown} sur {pages.total} devis
              </TableFooterBar>
            </div>
          ) : (
            <>
              <ul className="col gap-3">
                {pages.items.map((quote) => (
                  <li key={quote.id}>
                    <Link to={`/devis/${quote.id}`} className="card col gap-2 px-4 py-3.5 hover:bg-hover">
                      <div className="row between items-start">
                        <div className="col gap-0">
                          <b className="text-base">{quote.number ?? 'Sans numéro'}</b>
                          <span className="hint">
                            {quote.client_name ?? '-'} · {quote.plate ?? 'sans véhicule'}
                          </span>
                        </div>
                        <QuoteStatusBadge status={quote.status} />
                      </div>
                      <div className="row between text-[13px]">
                        <span className="muted">{formatDate(quote.created_at)}</span>
                        <b className="num">{formatEuro(quote.total_ttc)} TTC</b>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />
            </>
          ))}
      </div>
    </>
  );
}
