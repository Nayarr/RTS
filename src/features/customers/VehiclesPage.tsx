import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatDate, normalizeKey, VEHICLE_TYPES } from '@/features/repair-orders/constants';
import { todayIso } from '@/features/repair-orders/schemas';
import { cn } from '@/lib/utils';
import type { VehicleOverview } from './api';
import { CustomersTabs } from './CustomersTabs';
import { DEADLINE_TONE_CLASS, deadlineStatus } from './domain';
import { useVehicles } from './hooks';

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

/** Liste des véhicules : client, passages, dernier kilométrage, contrôle technique. */
export function VehiclesPage() {
  const vehicles = useVehicles();
  const [search, setSearch] = useState('');
  const today = todayIso();
  const list = useMemo(
    () => (vehicles.data ?? []).filter((vehicle) => matches(vehicle, search.trim())),
    [vehicles.data, search],
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold">Clients et véhicules</h1>
        <p className="text-muted-foreground">
          Fiches clients, historique, impayés et échéances des véhicules.
        </p>
      </div>
      <CustomersTabs />

      <div className="relative w-full max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label="Rechercher un véhicule"
          placeholder="Plaque, client, marque, VIN…"
          className="h-11 pl-9 text-base"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {vehicles.isPending && <p className="text-muted-foreground">Chargement…</p>}
      {vehicles.isError && <p className="text-destructive">Impossible de charger les véhicules.</p>}
      {vehicles.isSuccess && list.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun véhicule.
        </p>
      )}

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {list.map((vehicle) => {
          const ct = deadlineStatus(vehicle.ct_due_date, today);
          return (
            <li key={vehicle.id} className="min-w-0">
              <Link
                to={`/vehicules/${vehicle.id}`}
                className="block h-full rounded-lg border bg-card p-4 transition hover:bg-muted"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-lg tracking-wide">{vehicle.plate}</strong>
                  {ct && ct.tone !== 'ok' && (
                    <span className={cn('text-sm font-semibold', DEADLINE_TONE_CLASS[ct.tone])}>
                      CT : {ct.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {[
                    VEHICLE_TYPES[vehicle.vehicle_type],
                    vehicle.client_name ?? 'sans client',
                    [vehicle.brand, vehicle.model].filter(Boolean).join(' '),
                    `${vehicle.orders_count} passage${vehicle.orders_count > 1 ? 's' : ''}`,
                    vehicle.last_visit ? `dernier le ${formatDate(vehicle.last_visit)}` : '',
                  ]
                    .filter(Boolean)
                    .join(' — ')}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
