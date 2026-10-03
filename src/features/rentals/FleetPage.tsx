import { useState } from 'react';
import { Link } from 'react-router';
import { Plus, Search, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/button';
import { todayIso } from '@/features/repair-orders/schemas';
import { formatEuro } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import type { FleetCategory, FleetVehicle } from './fleet-api';
import {
  blockReason,
  CATEGORIES,
  CATEGORY_META,
  fleetStatus,
  hasEngine,
  vehicleTitle,
  worstDeadline,
} from './fleet-domain';
import { useFleet } from './fleet-hooks';
import { LocationTabs, VehicleVisual } from './ui';

type Availability = 'available' | 'unavailable';

/** Flotte de location : véhicules du garage, disponibilité et échéances. */
export function FleetPage() {
  const fleet = useFleet();
  const today = todayIso();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<FleetCategory | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);

  const vehicles = (fleet.data ?? []).filter((vehicle) => vehicle.is_active);
  const available = (vehicle: FleetVehicle) => blockReason(vehicle, today) === null;
  const needle = search.trim().toLowerCase();
  const shown = vehicles.filter(
    (vehicle) =>
      (!category || vehicle.category === category) &&
      (!availability || available(vehicle) === (availability === 'available')) &&
      (!needle ||
        `${vehicle.plate} ${vehicle.plate_key} ${vehicle.brand} ${vehicle.model}`
          .toLowerCase()
          .includes(needle)),
  );

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Location' }, { label: 'Flotte' }]}
        title="Flotte de location"
        actions={
          <Button asChild>
            <Link to="/location/flotte/nouveau">
              <Plus /> Ajouter un véhicule
            </Link>
          </Button>
        }
      />

      <div className="col gap-4">
        <div className="toolbar flex-wrap">
          <LocationTabs />
        </div>
        <div className="toolbar flex-wrap">
          <div className="row flex-wrap gap-3">
            <label className="srch w-full sm:w-[280px]">
              <Search className="i s" />
              <input
                type="search"
                className="inp"
                aria-label="Rechercher un véhicule"
                placeholder="Plaque, modèle…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="chips" role="group" aria-label="Catégorie">
              <button
                type="button"
                className={cn('chip', !category && 'on')}
                aria-pressed={!category}
                onClick={() => setCategory(null)}
              >
                Tous <span className="n">{vehicles.length}</span>
              </button>
              {CATEGORIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn('chip', category === value && 'on')}
                  aria-pressed={category === value}
                  onClick={() => setCategory(category === value ? null : value)}
                >
                  {CATEGORY_META[value].plural}{' '}
                  <span className="n">{vehicles.filter((vehicle) => vehicle.category === value).length}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="seg" role="group" aria-label="Disponibilité">
            {(
              [
                ['available', 'Disponibles'],
                ['unavailable', 'Indisponibles'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(availability === value && 'on')}
                aria-pressed={availability === value}
                onClick={() => setAvailability(availability === value ? null : value)}
              >
                {label}{' '}
                <span className="n">
                  {vehicles.filter((vehicle) => available(vehicle) === (value === 'available')).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {fleet.isPending && <p className="text-muted-foreground">Chargement…</p>}
        {fleet.isError && <p className="text-destructive">Impossible de charger la flotte.</p>}
        {fleet.isSuccess && vehicles.length === 0 && (
          <div className="empty col items-center gap-2.5 p-8">
            <span>Ajoute les véhicules que le garage loue ou prête pendant les réparations.</span>
            <Button variant="outline" size="sm" asChild>
              <Link to="/location/flotte/nouveau">Ajouter un véhicule</Link>
            </Button>
          </div>
        )}

        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((vehicle) => {
            const status = fleetStatus(vehicle, today);
            const deadline = worstDeadline(vehicle, today);
            return (
              <li key={vehicle.id}>
                <Link
                  to={`/location/flotte/${vehicle.id}`}
                  className="card block overflow-hidden transition-colors hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))]"
                  aria-label={`${vehicle.plate} — ${vehicleTitle(vehicle)}`}
                >
                  <div className="relative h-[118px] border-b">
                    <VehicleVisual
                      category={vehicle.category}
                      fileId={vehicle.photo_file_id}
                      alt={`Photo ${vehicle.plate}`}
                      className="h-full w-full rounded-none"
                    />
                    <span className={cn('badge dot absolute top-2.5 left-2.5', status.tone)}>
                      {status.label}
                    </span>
                  </div>
                  <div className="col gap-1.5 px-3.5 py-3">
                    <div className="row between">
                      <span className="plate">{vehicle.plate}</span>
                      <span className="muted text-xs">{CATEGORY_META[vehicle.category].label}</span>
                    </div>
                    <span className="text-[13px]">{vehicleTitle(vehicle)}</span>
                    <div className="hr" />
                    <div className="row between text-[12.5px]">
                      <span>
                        <b>{formatEuro(vehicle.daily_rate)}</b> <span className="muted">HT / jour</span>
                      </span>
                      {deadline ? (
                        <span
                          className={cn(
                            'row gap-1 font-semibold',
                            deadline.state === 'late' ? 'text-destructive' : 'warn-t',
                          )}
                          title={`${deadline.label} : ${deadline.text}`}
                        >
                          <TriangleAlert className="i xs" />
                          {deadline.label}
                        </span>
                      ) : (
                        <span className="muted">
                          {hasEngine(vehicle.category) && vehicle.mileage !== null
                            ? `${vehicle.mileage.toLocaleString('fr-FR')} km`
                            : hasEngine(vehicle.category)
                              ? ''
                              : 'sans moteur'}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        {fleet.isSuccess && vehicles.length > 0 && shown.length === 0 && (
          <p className="empty">Aucun véhicule ne correspond.</p>
        )}
      </div>
    </>
  );
}
