import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { ClientOverview } from './api';
import { CustomersTabs } from './CustomersTabs';
import { daysSince } from './domain';
import { useClients } from './hooks';

type Filter = 'all' | 'unpaid';

const matches = (client: ClientOverview, search: string) => {
  if (!search) return true;
  const text = search.toLowerCase();
  return [client.name, client.email, client.phone, client.siren].some((value) =>
    (value ?? '').toLowerCase().includes(text),
  );
};

/** Liste des clients : véhicules, OR, chiffre d'affaires, impayés, dernière visite. */
export function ClientsPage() {
  const clients = useClients();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const list = useMemo(
    () =>
      (clients.data ?? []).filter(
        (client) => matches(client, search.trim()) && (filter === 'all' || client.balance_due > 0),
      ),
    [clients.data, search, filter],
  );
  const unpaid = (clients.data ?? []).filter((client) => client.balance_due > 0).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Clients et véhicules</h1>
        <p className="text-muted-foreground">
          Fiches clients, historique, impayés et échéances des véhicules.
        </p>
      </div>
      <CustomersTabs />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Rechercher un client"
            placeholder="Nom, e-mail, téléphone, SIREN…"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div role="group" aria-label="Filtrer les clients" className="flex gap-2">
          {(
            [
              ['all', `Tous ${clients.data?.length ?? 0}`],
              ['unpaid', `Avec impayés ${unpaid}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                filter === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {clients.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {clients.isError && <p className="text-destructive">Impossible de charger les clients.</p>}
      {clients.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun client{search ? ' correspondant' : ''}.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {list.map((client) => {
          const since = daysSince(client.last_visit);
          return (
            <li key={client.id} className="min-w-0">
              <Link
                to={`/clients/${client.id}`}
                className="block h-full rounded-lg border bg-card p-4 transition hover:bg-muted"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong>{client.name}</strong>
                  {client.balance_due > 0 && (
                    <span
                      className={cn(
                        'text-sm font-semibold',
                        client.overdue_invoices_count > 0 ? 'text-destructive' : 'text-amber-700',
                      )}
                    >
                      Impayés : {formatEuro(client.balance_due)} TTC
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {client.vehicles_count} véhicule{client.vehicles_count > 1 ? 's' : ''} —{' '}
                  {client.orders_count} OR — CA HT : {formatEuro(client.revenue_ht)}
                  {since !== null && (
                    <>
                      {' '}
                      — Dernière visite : il y a {since} j
                      {since > 180 && <span className="text-amber-700"> ⚠</span>}
                    </>
                  )}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
