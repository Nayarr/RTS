import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Download, Layers, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useProfile } from '@/features/auth/useProfile';
import { formatDate, normalizeKey } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { downloadFile, toCsv } from '@/lib/csv';
import { formatEuro } from '@/lib/numbers';
import { useIsDesktop } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
import type { InvoiceOverview } from './api';
import { invoicesCsvRows } from './domain';
import { GroupedInvoiceDialog } from './GroupedInvoiceDialog';
import { useCreditNotes, useInvoices } from './hooks';
import { InvoiceStatusBadge } from './PaymentStatusBadge';

type Filter = 'to_collect' | 'overdue' | 'paid' | 'draft' | 'all';
type Sort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'to_collect', label: 'À encaisser' },
  { value: 'overdue', label: 'En retard' },
  { value: 'paid', label: 'Payées' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'all', label: 'Toutes' },
];

function matchesFilter(invoice: InvoiceOverview, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'draft') return invoice.status === 'draft';
  if (invoice.status === 'draft') return false;
  if (filter === 'paid') return invoice.payment_status === 'paid';
  if (filter === 'overdue') return invoice.payment_status === 'overdue';
  return invoice.payment_status !== 'paid';
}

/** Date de référence : émission, ou création pour un brouillon. */
const invoiceDate = (invoice: InvoiceOverview) => (invoice.issued_at ?? invoice.created_at).slice(0, 10);

function matchesSearch(invoice: InvoiceOverview, search: string) {
  if (!search) return true;
  const text = search.toLowerCase();
  const key = normalizeKey(search);
  return (
    (invoice.number ?? '').toLowerCase().includes(text) ||
    (invoice.client_name ?? '').toLowerCase().includes(text) ||
    (key.length > 0 && normalizeKey(invoice.vehicle_label ?? '').includes(key)) ||
    invoice.repair_order_numbers.some((number) => number.toLowerCase().includes(text))
  );
}

function DocumentTabs() {
  const tab = (to: string, label: string) => (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
          isActive
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )
      }
    >
      {label}
    </NavLink>
  );
  return (
    <nav aria-label="Documents de facturation" className="flex gap-1 border-b">
      {tab('/factures', 'Factures')}
      {tab('/factures/avoirs', 'Avoirs')}
    </nav>
  );
}

function InvoiceList() {
  const invoices = useInvoices();
  const { data: profile } = useProfile();
  const isDirection = profile?.role === 'direction';
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(
    () => FILTERS.find(({ value }) => value === params.get('filtre'))?.value ?? 'to_collect',
  );
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<Sort>('date_desc');

  const list = useMemo(() => {
    const filtered = (invoices.data ?? []).filter(
      (invoice) =>
        matchesFilter(invoice, filter) &&
        matchesSearch(invoice, search.trim()) &&
        (!from || invoiceDate(invoice) >= from) &&
        (!to || invoiceDate(invoice) <= to),
    );
    const direction = sort.endsWith('asc') ? 1 : -1;
    return filtered.sort((a, b) =>
      sort.startsWith('amount')
        ? direction * (a.total_ttc - b.total_ttc)
        : direction * invoiceDate(a).localeCompare(invoiceDate(b)),
    );
  }, [invoices.data, filter, search, from, to, sort]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(({ value }) => [
          value,
          (invoices.data ?? []).filter((i) => matchesFilter(i, value)).length,
        ]),
      ),
    [invoices.data],
  );
  const toCollect = list.reduce((sum, invoice) => sum + (invoice.balance_due ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Rechercher une facture"
            placeholder="N° de facture, client, plaque, n° d’OR…"
            className="h-11 pl-9 text-base"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="invoices-from">Du</Label>
          <Input
            id="invoices-from"
            type="date"
            className="h-11"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="invoices-to">au</Label>
          <Input
            id="invoices-to"
            type="date"
            className="h-11"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <select
          aria-label="Tri"
          className="h-11 rounded-md border bg-transparent px-3"
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
        >
          <option value="date_desc">Date (récent)</option>
          <option value="date_asc">Date (ancien)</option>
          <option value="amount_desc">Montant (décroissant)</option>
          <option value="amount_asc">Montant (croissant)</option>
        </select>
      </div>
      <div role="group" aria-label="Filtrer par état" className="flex gap-2 overflow-x-auto pb-1">
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

      {invoices.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {invoices.isError && <p className="text-destructive">Impossible de charger les factures.</p>}
      {invoices.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucune facture correspondante.
        </p>
      )}
      {list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            {toCollect > 0 && (
              <>
                Reste à encaisser sur cette liste :{' '}
                <strong className="tabular-nums">{formatEuro(toCollect)}</strong> TTC
              </>
            )}
          </p>
          {isDirection && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const { headers, rows } = invoicesCsvRows(list);
                downloadFile(toCsv(headers, rows), `factures-${todayIso()}.csv`);
              }}
            >
              <Download /> Export CSV
            </Button>
          )}
        </div>
      )}

      {list.length > 0 &&
        (isDesktop ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Facture</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>État</TableHead>
                  <TableHead className="text-right">Total TTC</TableHead>
                  <TableHead className="text-right">Reste dû</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer"
                    onClick={() => void navigate(`/factures/${invoice.id}`)}
                  >
                    <TableCell>
                      <Link to={`/factures/${invoice.id}`} className="font-semibold hover:underline">
                        {invoice.number ?? 'Brouillon'}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {invoice.repair_order_numbers.join(', ') || 'Sans OR'}
                        {invoice.repair_order_ids.length > 1 && ' (groupée)'}
                      </div>
                    </TableCell>
                    <TableCell>{invoice.client_name ?? '—'}</TableCell>
                    <TableCell>{invoice.vehicle_label ?? '—'}</TableCell>
                    <TableCell>
                      <InvoiceStatusBadge invoice={invoice} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatEuro(invoice.total_ttc)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {invoice.status === 'issued' ? formatEuro(invoice.balance_due) : '—'}
                    </TableCell>
                    <TableCell>{formatDate(invoiceDate(invoice))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  to={`/factures/${invoice.id}`}
                  className="block rounded-lg border bg-card p-4 transition hover:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-bold">{invoice.number ?? 'Brouillon'}</div>
                      <div className="text-sm text-muted-foreground">
                        {invoice.client_name ?? '—'} · {invoice.vehicle_label ?? '—'}
                      </div>
                    </div>
                    <InvoiceStatusBadge invoice={invoice} />
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="text-muted-foreground">{formatDate(invoiceDate(invoice))}</span>
                    <span className="tabular-nums">
                      <strong>{formatEuro(invoice.total_ttc)}</strong> TTC
                      {invoice.status === 'issued' &&
                        (invoice.balance_due ?? 0) > 0.01 &&
                        (invoice.balance_due ?? 0) < invoice.total_ttc - 0.01 &&
                        ` · reste ${formatEuro(invoice.balance_due)}`}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

function CreditNoteList() {
  const notes = useCreditNotes();
  if (notes.isPending) return <p className="text-muted-foreground">Chargement…</p>;
  if (notes.isError) return <p className="text-destructive">Impossible de charger les avoirs.</p>;
  if (notes.data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">Aucun avoir.</p>
    );
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {notes.data.map((note) => (
        <li key={note.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <p className="font-semibold">
              {note.number}{' '}
              <span className="font-normal text-muted-foreground">
                sur la facture{' '}
                <Link className="underline" to={`/factures/${note.invoice_id}`}>
                  {note.invoice_number}
                </Link>
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {formatDate(note.issued_at)} · {note.client_name ?? '—'} · {note.vehicle_label ?? '—'}
              {note.reason && ` · ${note.reason}`}
            </p>
          </div>
          <strong className="tabular-nums">−{formatEuro(note.total_ttc)} TTC</strong>
        </li>
      ))}
    </ul>
  );
}

/** Factures et avoirs : encaissements à suivre, facture groupée. */
export function InvoicesPage() {
  const { pathname } = useLocation();
  const [grouping, setGrouping] = useState(false);
  const creditNotes = pathname.endsWith('/avoirs');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Facturation</h1>
          <p className="text-muted-foreground">
            Les factures se préparent depuis l’OR (« Facturer ») ou en regroupant plusieurs OR.
          </p>
        </div>
        <Button size="lg" variant="outline" onClick={() => setGrouping(true)}>
          <Layers /> Facture groupée
        </Button>
      </div>
      <DocumentTabs />
      {creditNotes ? <CreditNoteList /> : <InvoiceList />}
      {grouping && <GroupedInvoiceDialog onClose={() => setGrouping(false)} />}
    </div>
  );
}
