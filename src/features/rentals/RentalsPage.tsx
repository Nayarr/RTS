import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, Plus, Wrench } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { FilterChips, SearchField } from '@/components/ListControls';
import { Button } from '@/components/ui/button';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { RentalKind, RentalOverview } from './rental-api';
import { KIND_LABELS, rentalStatus, shortDateTime } from './rental-domain';
import { useRentals } from './rental-hooks';
import { LocationTabs } from './ui';

type StatusFilter = 'all' | 'active' | 'reserved' | 'late' | 'returned' | 'closed';

const matchesStatus = (rental: RentalOverview, filter: StatusFilter) => {
  if (filter === 'all') return rental.status !== 'cancelled';
  if (filter === 'late') return rental.is_late;
  if (filter === 'closed') return rental.status === 'closed' || rental.status === 'cancelled';
  return rental.status === filter;
};

/** Locations et prêts : recherche, type, statut ; ouvre la fiche du contrat. */
export function RentalsPage() {
  const rentals = useRentals();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<RentalKind | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const all = useMemo(() => rentals.data ?? [], [rentals.data]);
  const needle = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      all.filter(
        (rental) =>
          (!kind || rental.kind === kind) &&
          matchesStatus(rental, status) &&
          (!needle ||
            [rental.number, rental.client_name, rental.plate].some((value) =>
              value.toLowerCase().includes(needle),
            )),
      ),
    [all, kind, status, needle],
  );
  const count = (filter: StatusFilter) => all.filter((rental) => matchesStatus(rental, filter)).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Location' }, { label: 'Locations' }]}
        title="Locations et prêts"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/location/nouvelle?type=pret">
                <Wrench /> Prêter un véhicule
              </Link>
            </Button>
            <Button asChild>
              <Link to="/location/nouvelle">
                <Plus /> Nouvelle location
              </Link>
            </Button>
          </>
        }
      />
      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <LocationTabs />
        </div>
        <div className="toolbar flex-wrap">
          <div className="row flex-wrap gap-3">
            <SearchField
              className="sm:w-[300px]"
              aria-label="Rechercher un contrat"
              placeholder="Client, plaque, n° de contrat…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="seg" role="group" aria-label="Type">
              {(
                [
                  [null, 'Tout'],
                  ['rental', 'Locations'],
                  ['loan', 'Prêts'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  className={cn(kind === value && 'on')}
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <FilterChips
            label="Statut"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: 'Tous', count: count('all') },
              { value: 'active', label: 'En cours', count: count('active') },
              { value: 'reserved', label: 'Réservées', count: count('reserved') },
              { value: 'late', label: 'En retard', count: count('late'), color: '#B5453A' },
              { value: 'returned', label: 'À facturer', count: count('returned') },
              { value: 'closed', label: 'Clôturées', count: count('closed') },
            ]}
          />
        </div>

        {rentals.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {rentals.isError && <p className="text-destructive">Impossible de charger les contrats.</p>}
        {rentals.isSuccess && shown.length === 0 && (
          <p className="empty">
            {all.length ? 'Aucun contrat ne correspond.' : 'Aucune location pour le moment.'}
          </p>
        )}
        {shown.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl" aria-label="Contrats de location">
              <thead>
                <tr>
                  <th>Contrat</th>
                  <th>Client</th>
                  <th>Véhicule</th>
                  <th>Départ</th>
                  <th>Retour prévu</th>
                  <th className="r">Estimé HT</th>
                  <th>Statut</th>
                  <th className="w-10">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((rental) => {
                  const state = rentalStatus(rental);
                  return (
                    <tr
                      key={rental.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/location/contrats/${rental.id}`)}
                    >
                      <td>
                        <Link to={`/location/contrats/${rental.id}`} className="c2">
                          <b className="num">{rental.number}</b>
                          <span>
                            {KIND_LABELS[rental.kind]}
                            {rental.repair_order_number ? ` · ${rental.repair_order_number}` : ''}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className="c2">
                          <b>{rental.client_name}</b>
                          <span>{rental.client_kind === 'individual' ? 'Particulier' : 'Pro'}</span>
                        </span>
                      </td>
                      <td>
                        <span className="c2">
                          <b className="plate">{rental.plate}</b>
                          <span>
                            {rental.brand} {rental.model}
                          </span>
                        </span>
                      </td>
                      <td className="num">{shortDateTime(rental.departure_at)}</td>
                      <td className={cn('num', rental.is_late && 'font-semibold text-destructive')}>
                        {shortDateTime(rental.planned_return_at)}
                      </td>
                      <td className="r num b">
                        {rental.billable ? formatEuro(rental.estimated_ht) : 'Gratuit'}
                      </td>
                      <td>
                        <span className={cn('badge', state.tone)}>{state.label}</span>
                      </td>
                      <td>
                        <ChevronRight className="i s text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
