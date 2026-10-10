import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ChevronRight, Plus } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips, Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { useIsDesktop } from '@/lib/use-media-query';
import { usePagination } from '@/lib/use-pagination';
import type { RepairOrderOverview } from './api';
import {
  formatDate,
  formatDuration,
  normalizeKey,
  STATUS_META,
  STATUS_ORDER,
  type RepairOrderStatus,
} from './constants';
import { useRepairOrders } from './hooks';
import { StatusBadge } from './StatusBadge';
import { taskSummary } from './tasks';

type Filter = 'active' | 'all' | 'parts' | RepairOrderStatus;

const FILTERS: { value: Filter; label: string; color?: string }[] = [
  { value: 'active', label: 'En cours de traitement' },
  ...STATUS_ORDER.map((status) => ({
    value: status,
    label: STATUS_META[status].label,
    color: STATUS_META[status].color,
  })),
  { value: 'parts', label: 'Pièces en attente', color: '#B5453A' },
  { value: 'all', label: 'Tous' },
];

const PAGE_SIZE = 20;

function matchesFilter(order: RepairOrderOverview, filter: Filter) {
  if (filter === 'active') return order.status !== 'invoiced';
  if (filter === 'all') return true;
  if (filter === 'parts') return (order.parts_pending_count ?? 0) > 0;
  return order.status === filter;
}

function matchesSearch(order: RepairOrderOverview, search: string) {
  if (!search) return true;
  const text = search.toLowerCase();
  const key = normalizeKey(search);
  return (
    (key.length > 0 && (order.plate_key ?? '').includes(key)) ||
    order.number.toLowerCase().includes(text) ||
    (order.client_name ?? '').toLowerCase().includes(text) ||
    (order.technician_name ?? '').toLowerCase().includes(text)
  );
}

function Technician({ order }: { order: RepairOrderOverview }) {
  const color = order.technician_name ? (order.technician_color ?? '#6B7280') : '#9aa0a6';
  return (
    <span className="who">
      <span className="tdot" style={{ '--c': color } as CSSProperties} />
      {order.technician_name ?? <span className="muted">Non assigné</span>}
    </span>
  );
}

function PartsBadge({ order }: { order: RepairOrderOverview }) {
  if (!order.parts_pending_count) return null;
  return <span className="badge s-bad h-6 text-xs">Attente pièces ({order.parts_pending_count})</span>;
}

/** Tableau de bord des OR (bureau) : filtres par statut, recherche, accès à la fiche. */
export function RepairOrdersPage() {
  const orders = useRepairOrders();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(
    () => FILTERS.find(({ value }) => value === params.get('filtre'))?.value ?? 'active',
  );
  const [search, setSearch] = useState('');

  const list = useMemo(
    () => (orders.data ?? []).filter((o) => matchesFilter(o, filter) && matchesSearch(o, search.trim())),
    [orders.data, filter, search],
  );
  const counts = useMemo(() => {
    const all = orders.data ?? [];
    return Object.fromEntries(
      FILTERS.map(({ value }) => [value, all.filter((o) => matchesFilter(o, value)).length]),
    );
  }, [orders.data]);
  const pages = usePagination(list, PAGE_SIZE, `${filter}|${search}`);
  const running = list.some((order) => order.running_since);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Atelier' }, { label: 'Ordres de réparation' }]}
        title="Ordres de réparation"
        actions={
          <>
            <span className="sub hidden md:inline">Suivi des véhicules à l’atelier</span>
            <Button asChild>
              <Link to="/or/nouveau">
                <Plus /> Nouvel OR
              </Link>
            </Button>
          </>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <SearchField
            aria-label="Rechercher un OR"
            placeholder="Plaque, client, technicien, n° d’OR…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {orders.isSuccess && <span className="muted text-[13px]">{list.length} OR affichés</span>}
        </div>
        <FilterChips
          label="Filtrer par statut"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((option) => ({ ...option, count: counts[option.value] ?? 0 }))}
        />

        {orders.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {orders.isError && <p className="text-destructive">Impossible de charger les OR.</p>}
        {orders.isSuccess && list.length === 0 && (
          <p className="empty">Aucun ordre de réparation ne correspond.</p>
        )}

        {list.length > 0 &&
          (isDesktop ? (
            <div className="card tbl-wrap overflow-x-auto!">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Véhicule</th>
                    <th>Client</th>
                    <th>Technicien</th>
                    <th>Statut</th>
                    <th className="r">Temps</th>
                    <th>Créé le</th>
                    <th className="w-12">
                      <span className="sr-only">Ouvrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pages.items.map((order) => (
                    <tr
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/or/${order.id}`)}
                    >
                      <td>
                        <Link to={`/or/${order.id}`} className="c2">
                          <b className="plate">{order.plate}</b>
                          <span>{order.number}</span>
                        </Link>
                      </td>
                      <td>{order.client_name ?? '-'}</td>
                      <td>
                        <Technician order={order} />
                      </td>
                      <td>
                        <span className="row gap-1.5">
                          <StatusBadge status={order.status} technicianId={order.technician_id} />
                          <PartsBadge order={order} />
                        </span>
                      </td>
                      <td className="r num">
                        {order.running_since && <span className="warn-t mr-1.5">●</span>}
                        {formatDuration(order.worked_seconds)}
                      </td>
                      <td className="num">{formatDate(order.created_at)}</td>
                      <td>
                        <Link
                          to={`/or/${order.id}`}
                          className="ibtn sm ghost"
                          aria-label={`Ouvrir la fiche ${order.number}`}
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
                {pages.shown} sur {pages.total}
                {running && (
                  <>
                    {' · '}
                    <span className="warn-t">●</span> chrono en cours
                  </>
                )}
              </TableFooterBar>
            </div>
          ) : (
            <>
              <ul className="col gap-3">
                {pages.items.map((order) => (
                  <li key={order.id}>
                    <Link to={`/or/${order.id}`} className="card col gap-2 px-4 py-3.5 hover:bg-hover">
                      <div className="row between items-start">
                        <div className="col gap-0">
                          <span className="plate text-xl">{order.plate}</span>
                          <span className="hint">{order.client_name ?? 'Client non renseigné'}</span>
                        </div>
                        <StatusBadge status={order.status} technicianId={order.technician_id} />
                      </div>
                      <p className="line-clamp-2">{taskSummary(order.requested_work)}</p>
                      <div className="row between wrap gap-2 text-[13px]">
                        <Technician order={order} />
                        <span className="muted">
                          {order.number} · {formatDuration(order.worked_seconds)}
                        </span>
                      </div>
                      <PartsBadge order={order} />
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
