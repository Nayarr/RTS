import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Pager, SearchField, TableFooterBar } from '@/components/ListControls';
import { normalizeKey, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { usePagination } from '@/lib/use-pagination';
import type { VehicleOverview } from './api';
import { CustomersTabs } from './CustomersTabs';
import { DEADLINE_BADGE_CLASS, deadlineStatus, tailgateDueEnd } from './domain';
import { useVehicles } from './hooks';

const PAGE_SIZE = 20;

const matches = (vehicle: VehicleOverview, search: string) => {
  if (!search) return true;
  const key = normalizeKey(search);
  const text = search.toLowerCase();
  return (
    (key.length > 0 && (vehicle.plate_key ?? '').includes(key)) ||
    [vehicle.client_name, vehicle.brand, vehicle.model, vehicle.vin].some((value) =>
      (value ?? '').toLowerCase().includes(text),
    )
  );
};

/** Échéance la plus proche du véhicule (contrôle technique, hayon ou antipollution). */
function nextDeadline(vehicle: VehicleOverview, today: string) {
  const items = [
    { kind: 'CT', status: deadlineStatus(vehicle.ct_due_date, today) },
    { kind: 'Hayon', status: deadlineStatus(tailgateDueEnd(vehicle.tailgate_due_date), today) },
    { kind: 'Antipollution', status: deadlineStatus(vehicle.antipollution_due_date, today) },
  ].flatMap(({ kind, status }) => (status ? [{ kind, ...status }] : []));
  return items.sort((a, b) => a.days - b.days)[0] ?? null;
}

/** Liste des véhicules : client, passages, dernier kilométrage, échéances. */
export function VehiclesPage() {
  const vehicles = useVehicles();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const today = todayIso();
  const list = useMemo(
    () => (vehicles.data ?? []).filter((vehicle) => matches(vehicle, search.trim())),
    [vehicles.data, search],
  );
  const pages = usePagination(list, PAGE_SIZE, search);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Clients et véhicules' }, { label: 'Véhicules' }]}
        title="Véhicules"
        actions={
          vehicles.isSuccess && (
            <span className="sub hidden md:inline">{vehicles.data.length} véhicules suivis</span>
          )
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <CustomersTabs />
          <SearchField
            className="sm:w-[380px]"
            aria-label="Rechercher un véhicule"
            placeholder="Plaque, client, marque, VIN…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {vehicles.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {vehicles.isError && <p className="text-destructive">Impossible de charger les véhicules.</p>}
        {vehicles.isSuccess && list.length === 0 && <p className="empty">Aucun véhicule.</p>}

        {list.length > 0 && (
          <div className="card tbl-wrap overflow-x-auto!">
            <table className="tbl" aria-label="Liste des véhicules">
              <thead>
                <tr>
                  <th>Immatriculation</th>
                  <th>Marque et modèle</th>
                  <th>Type</th>
                  <th>Client</th>
                  <th>N° de série (VIN)</th>
                  <th className="r">Kilométrage</th>
                  <th>Échéances</th>
                  <th className="w-12">
                    <span className="sr-only">Ouvrir</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pages.items.map((vehicle) => {
                  const deadline = nextDeadline(vehicle, today);
                  return (
                    <tr
                      key={vehicle.id}
                      className="cursor-pointer"
                      onClick={() => void navigate(`/vehicules/${vehicle.id}`)}
                    >
                      <td>
                        <Link to={`/vehicules/${vehicle.id}`} className="plate-tag">
                          {vehicle.plate}
                        </Link>
                      </td>
                      <td className="b">
                        {[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || (
                          <span className="muted font-normal">-</span>
                        )}
                      </td>
                      <td>
                        <span className="tag">{VEHICLE_TYPES[vehicle.vehicle_type]}</span>
                      </td>
                      <td>{vehicle.client_name ?? <span className="muted">sans client</span>}</td>
                      <td className="muted num text-[12.5px]">{vehicle.vin ?? '-'}</td>
                      <td className="r num">
                        {vehicle.last_mileage !== null
                          ? `${vehicle.last_mileage.toLocaleString('fr-FR')} km`
                          : '-'}
                      </td>
                      <td>
                        {deadline ? (
                          <span className={`badge ${DEADLINE_BADGE_CLASS[deadline.tone]}`}>
                            {deadline.tone === 'ok'
                              ? 'OK'
                              : deadline.tone === 'overdue'
                                ? `${deadline.kind} dépassé (${-deadline.days} j)`
                                : `${deadline.kind} dans ${deadline.days} j`}
                          </span>
                        ) : (
                          <span className="hint">-</span>
                        )}
                      </td>
                      <td>
                        <Link
                          to={`/vehicules/${vehicle.id}`}
                          className="ibtn sm ghost"
                          aria-label={`Ouvrir la fiche ${vehicle.plate}`}
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
              {pages.shown} sur {pages.total} véhicules
            </TableFooterBar>
          </div>
        )}
      </div>
    </>
  );
}
