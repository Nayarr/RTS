import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { ChevronRight, Download, Info, Layers } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips, Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { SectionNav } from '@/components/SectionNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfile } from '@/features/auth/useProfile';
import { formatDate, normalizeKey } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { downloadFile, toCsv } from '@/lib/csv';
import { formatEuro } from '@/lib/numbers';
import { useIsDesktop } from '@/lib/use-media-query';
import { usePagination } from '@/lib/use-pagination';
import type { InvoiceOverview } from './api';
import { invoicesCsvRows } from './domain';
import { GroupedInvoiceDialog } from './GroupedInvoiceDialog';
import { useCreditNotes, useInvoices } from './hooks';
import { InvoiceStatusBadge } from './PaymentStatusBadge';

type Filter = 'to_collect' | 'overdue' | 'paid' | 'draft' | 'no_order' | 'all';
type Sort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const FILTERS: { value: Filter; label: string; color?: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'draft', label: 'Brouillons', color: '#6B7280' },
  { value: 'to_collect', label: 'À encaisser', color: '#C98A00' },
  { value: 'overdue', label: 'En retard', color: '#B5453A' },
  { value: 'paid', label: 'Payées', color: '#2A6B52' },
  { value: 'no_order', label: 'Sans OR' },
];

const PAGE_SIZE = 20;

function matchesFilter(invoice: InvoiceOverview, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'no_order') return invoice.repair_order_ids.length === 0;
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
  return (
    <SectionNav
      label="Documents de facturation"
      links={[
        { to: '/factures', label: 'Factures' },
        { to: '/factures/avoirs', label: 'Avoirs' },
      ]}
    />
  );
}

function GroupedInvoiceButton() {
  const [grouping, setGrouping] = useState(false);
  return (
    <>
      <Button onClick={() => setGrouping(true)}>
        <Layers /> Facture groupée
      </Button>
      {grouping && <GroupedInvoiceDialog onClose={() => setGrouping(false)} />}
    </>
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
    () => FILTERS.find(({ value }) => value === params.get('filtre'))?.value ?? 'all',
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
  const pages = usePagination(list, PAGE_SIZE, `${filter}|${search}|${from}|${to}|${sort}`);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Facturation' }, { label: 'Factures' }]}
        title="Factures"
        actions={
          <>
            <span className="sub hidden max-w-[380px] text-right text-[13px] xl:inline">
              Les factures se préparent depuis l’OR (« Facturer ») ou en regroupant plusieurs OR.
            </span>
            {isDirection && (
              <Button
                variant="outline"
                disabled={list.length === 0}
                onClick={() => {
                  const { headers, rows } = invoicesCsvRows(list);
                  downloadFile(toCsv(headers, rows), `factures-${todayIso()}.csv`);
                }}
              >
                <Download /> Export CSV
              </Button>
            )}
            <GroupedInvoiceButton />
          </>
        }
      />

      <div className="col gap-3.5">
        <div className="toolbar flex-wrap">
          <DocumentTabs />
          <div className="row wrap gap-2.5">
            <SearchField
              className="sm:w-[330px]"
              aria-label="Rechercher une facture"
              placeholder="N° de facture, client, plaque, n° d’OR…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label htmlFor="invoices-from" className="muted text-[13px]">
              Du
            </label>
            <Input
              id="invoices-from"
              type="date"
              className="w-[150px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <label htmlFor="invoices-to" className="muted text-[13px]">
              au
            </label>
            <Input
              id="invoices-to"
              type="date"
              className="w-[150px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <select
              aria-label="Tri"
              className="inp w-[190px]"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
            >
              <option value="date_desc">Date (récent)</option>
              <option value="date_asc">Date (ancien)</option>
              <option value="amount_desc">Montant (décroissant)</option>
              <option value="amount_asc">Montant (croissant)</option>
            </select>
          </div>
        </div>
        <div className="row between wrap">
          <FilterChips
            label="Filtrer par état"
            value={filter}
            onChange={setFilter}
            options={FILTERS.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
          />
          {toCollect > 0 && (
            <span className="text-[13.5px]">
              Reste à encaisser sur cette liste : <b className="num">{formatEuro(toCollect)}</b> TTC
            </span>
          )}
        </div>

        {invoices.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {invoices.isError && <p className="text-destructive">Impossible de charger les factures.</p>}
        {invoices.isSuccess && list.length === 0 && <p className="empty">Aucune facture correspondante.</p>}

        {list.length > 0 &&
          (isDesktop ? (
            <div className="card tbl-wrap overflow-x-auto!">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Facture</th>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Véhicule</th>
                    <th className="r">Total TTC</th>
                    <th className="r">Reste dû</th>
                    <th>État</th>
                    <th className="w-12">
                      <span className="sr-only">Ouvrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.items.map((invoice) => (
                    <tr
                      key={invoice.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/factures/${invoice.id}`)}
                    >
                      <td>
                        <Link to={`/factures/${invoice.id}`} className="c2">
                          <b>{invoice.number ?? 'Brouillon'}</b>
                          <span>
                            {invoice.repair_order_numbers.join(', ') || 'Sans OR'}
                            {invoice.repair_order_ids.length > 1 && ' (groupée)'}
                          </span>
                        </Link>
                      </td>
                      <td className="num">{formatDate(invoiceDate(invoice))}</td>
                      <td>{invoice.client_name ?? '-'}</td>
                      <td>
                        {invoice.vehicle_label ? (
                          <span className="plate">{invoice.vehicle_label}</span>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                      <td className="r num b">{formatEuro(invoice.total_ttc)}</td>
                      <td className="r num">
                        {invoice.status === 'issued' ? formatEuro(invoice.balance_due) : '-'}
                      </td>
                      <td>
                        <InvoiceStatusBadge invoice={invoice} />
                      </td>
                      <td>
                        <Link
                          to={`/factures/${invoice.id}`}
                          className="ibtn sm ghost"
                          aria-label={`Ouvrir la facture ${invoice.number ?? ''}`}
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
                {pages.shown} sur {pages.total} factures
              </TableFooterBar>
            </div>
          ) : (
            <>
              <ul className="col gap-3">
                {pages.items.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      to={`/factures/${invoice.id}`}
                      className="card col gap-2 px-4 py-3.5 hover:bg-hover"
                    >
                      <div className="row between items-start">
                        <div className="col gap-0">
                          <b className="text-base">{invoice.number ?? 'Brouillon'}</b>
                          <span className="hint">
                            {invoice.client_name ?? '-'} · {invoice.vehicle_label ?? '-'}
                          </span>
                        </div>
                        <InvoiceStatusBadge invoice={invoice} />
                      </div>
                      <div className="row between text-[13px]">
                        <span className="muted">{formatDate(invoiceDate(invoice))}</span>
                        <span className="num">
                          <b>{formatEuro(invoice.total_ttc)}</b> TTC
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
              <Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />
            </>
          ))}
      </div>
    </>
  );
}

function CreditNoteList() {
  const notes = useCreditNotes();
  const total = (notes.data ?? []).reduce((sum, note) => sum + (note.total_ttc ?? 0), 0);
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Facturation' }, { label: 'Avoirs' }]}
        title="Avoirs"
        actions={
          <>
            <span className="sub hidden text-[13px] md:inline">
              Un avoir se génère depuis la facture concernée.
            </span>
            <GroupedInvoiceButton />
          </>
        }
      />
      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <DocumentTabs />
          {total > 0 && (
            <span className="text-[13.5px]">
              Total des avoirs : <b className="num">−{formatEuro(total)}</b> TTC
            </span>
          )}
        </div>
        {notes.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {notes.isError && <p className="text-destructive">Impossible de charger les avoirs.</p>}
        {notes.isSuccess && notes.data.length === 0 && <p className="empty">Aucun avoir.</p>}
        {notes.isSuccess && notes.data.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Avoir</th>
                  <th>Date</th>
                  <th>Facture d’origine</th>
                  <th>Client</th>
                  <th>Motif</th>
                  <th className="r">Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                {notes.data.map((note) => (
                  <tr key={note.id}>
                    <td className="b">{note.number}</td>
                    <td className="num">{formatDate(note.issued_at)}</td>
                    <td>
                      <Link className="ul" to={`/factures/${note.invoice_id}`}>
                        {note.invoice_number}
                      </Link>
                    </td>
                    <td>{note.client_name ?? '-'}</td>
                    <td className="muted max-w-[320px] truncate">{note.reason ?? '-'}</td>
                    <td className="r num b down">−{formatEuro(note.total_ttc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="alert s-blue">
          <Info className="i" />
          <span>
            Un avoir diminue le reste dû de la facture d’origine. Il a son propre numéro et son PDF, comme une
            facture.
          </span>
        </div>
      </div>
    </>
  );
}

/** Factures et avoirs : encaissements à suivre, facture groupée. */
export function InvoicesPage() {
  const { pathname } = useLocation();
  return pathname.endsWith('/avoirs') ? <CreditNoteList /> : <InvoiceList />;
}
