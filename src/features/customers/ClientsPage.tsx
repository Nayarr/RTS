import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { initials } from '@/app/nav';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips, Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { formatEuro } from '@/lib/numbers';
import { usePagination } from '@/lib/use-pagination';
import type { ClientOverview } from './api';
import { CustomersTabs } from './CustomersTabs';
import { daysSince } from './domain';
import { useClients } from './hooks';

type Filter = 'all' | 'unpaid';

const PAGE_SIZE = 20;

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
  const navigate = useNavigate();
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
  const pages = usePagination(list, PAGE_SIZE, `${filter}|${search}`);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Clients et véhicules' }, { label: 'Clients' }]}
        title="Clients"
        actions={
          <span className="sub hidden md:inline">
            Fiches clients, historique, impayés et échéances des véhicules
          </span>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CustomersTabs />
          <div className="row wrap gap-2.5">
            <SearchField
              className="sm:w-[340px]"
              aria-label="Rechercher un client"
              placeholder="Nom, e-mail, téléphone, SIREN…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <FilterChips
              label="Filtrer les clients"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Tous', count: clients.data?.length ?? 0 },
                { value: 'unpaid', label: 'Avec impayés', count: unpaid, color: '#B5453A' },
              ]}
            />
          </div>
        </div>

        {clients.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {clients.isError && <p className="text-destructive">Impossible de charger les clients.</p>}
        {clients.isSuccess && list.length === 0 && (
          <p className="empty">Aucun client{search ? ' correspondant' : ''}.</p>
        )}

        {list.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl" aria-label="Liste des clients">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="r">Véhicules</th>
                  <th className="r">OR</th>
                  <th className="r">CA HT</th>
                  <th>Dernière visite</th>
                  <th className="r">Impayés TTC</th>
                  <th className="w-12">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.items.map((client) => {
                  const since = daysSince(client.last_visit);
                  return (
                    <tr
                      key={client.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/clients/${client.id}`)}
                    >
                      <td>
                        <Link to={`/clients/${client.id}`} className="who">
                          <span className="av bg-muted! text-foreground!" aria-hidden>
                            {initials(client.name)}
                          </span>
                          <span className="c2">
                            <b>{client.name}</b>
                            {client.email && <span>{client.email}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="r num">{client.vehicles_count}</td>
                      <td className="r num">{client.orders_count}</td>
                      <td className="r num b">{formatEuro(client.revenue_ht)}</td>
                      <td>
                        {since === null ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className="row gap-1.5">
                            <span className="num">il y a {since} j</span>
                            {since > 180 && (
                              <span className="badge s-warn h-[22px] text-[11.5px]">+ de 6 mois</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="r">
                        {client.balance_due > 0 ? (
                          <span className={`badge ${client.overdue_invoices_count > 0 ? 's-bad' : 's-warn'}`}>
                            {formatEuro(client.balance_due)}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/clients/${client.id}`}
                          className="ibtn sm ghost"
                          aria-label={`Ouvrir la fiche de ${client.name}`}
                          tabIndex={-1}
                        >
                          <ChevronRight className="i s" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <TableFooterBar
              pager={<Pager page={pages.page} pageCount={pages.pageCount} onChange={pages.setPage} />}
            >
              {pages.shown} sur {pages.total} clients
            </TableFooterBar>
          </div>
        )}
      </div>
    </>
  );
}
