import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsDesktop } from '@/lib/use-media-query';
import { cn } from '@/lib/utils';
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

type Filter = 'active' | 'all' | 'parts' | RepairOrderStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'active', label: 'En cours de traitement' },
  ...STATUS_ORDER.map((status) => ({ value: status, label: STATUS_META[status].label })),
  { value: 'parts', label: 'Pièces en attente' },
  { value: 'all', label: 'Tous' },
];

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
  if (!order.technician_name) return <span className="text-muted-foreground">Non assigné</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: order.technician_color ?? '#6B7280' }}
      />
      {order.technician_name}
    </span>
  );
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Ordres de réparation</h1>
          <p className="text-muted-foreground">Suivi des véhicules à l’atelier.</p>
        </div>
        <Button size="lg" asChild>
          <Link to="/or/nouveau">
            <Plus /> Nouvel OR
          </Link>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Rechercher un OR"
            placeholder="Plaque, client, technicien, n° d’OR…"
            className="h-11 pl-9 text-base"
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

      {orders.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {orders.isError && <p className="text-destructive">Impossible de charger les OR.</p>}
      {orders.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun ordre de réparation ne correspond.
        </p>
      )}

      {list.length > 0 &&
        (isDesktop ? (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Véhicule</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Technicien</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Temps</TableHead>
                  <TableHead>Créé le</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => void navigate(`/or/${order.id}`)}
                  >
                    <TableCell>
                      <Link to={`/or/${order.id}`} className="font-semibold hover:underline">
                        {order.plate}
                      </Link>
                      <div className="text-xs text-muted-foreground">{order.number}</div>
                    </TableCell>
                    <TableCell>{order.client_name ?? '—'}</TableCell>
                    <TableCell>
                      <Technician order={order} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {order.running_since && <span className="mr-1 text-warning">●</span>}
                      {formatDuration(order.worked_seconds)}
                    </TableCell>
                    <TableCell>{formatDate(order.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((order) => (
              <li key={order.id}>
                <Link
                  to={`/or/${order.id}`}
                  className="block rounded-lg border bg-card p-4 transition hover:bg-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-lg font-bold">{order.plate}</div>
                      <div className="text-sm text-muted-foreground">
                        {order.client_name ?? 'Client non renseigné'}
                      </div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm">{order.requested_work}</p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <Technician order={order} />
                    <span className="text-muted-foreground">
                      {order.number} · {formatDuration(order.worked_seconds)}
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
