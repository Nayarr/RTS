-- =============================================================================
-- Location — flotte de véhicules du garage (louables, ou prêtés pendant un OR)
--
-- Véhicules propres au garage, distincts des véhicules des clients : tarifs de location,
-- échéances (contrôle technique, assurance, vidange) et « boîte à gants » (documents du
-- véhicule, tous facultatifs). Un véhicule dont l'assurance ou le contrôle technique est
-- expiré, ou en entretien, ne peut plus être loué ni prêté.
-- =============================================================================

create type public.fleet_category as enum ('tractor', 'trailer', 'van', 'car');
comment on type public.fleet_category is
  'Tracteur PL, remorque / semi (sans moteur ni km), utilitaire, voiture.';

create table public.fleet_vehicles (
  id                    uuid primary key default gen_random_uuid(),
  plate                 text not null check (btrim(plate) <> ''),
  plate_key             text generated always as (public.normalize_key(plate)) stored,
  brand                 text not null check (btrim(brand) <> ''),
  model                 text not null check (btrim(model) <> ''),
  category              public.fleet_category not null,
  vin                   text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  first_registration    date,
  mileage               integer check (mileage >= 0),
  fuel_type             text,
  tank_liters           integer check (tank_liters > 0),
  license_category      text not null default 'B' check (license_category in ('B', 'BE', 'C1', 'C', 'CE')),
  loanable              boolean not null default true,       -- proposé comme véhicule de prêt pendant un OR
  -- Tarifs de location (HT)
  daily_rate            numeric(10,2) not null check (daily_rate >= 0),
  weekend_rate          numeric(10,2) check (weekend_rate >= 0),
  week_rate             numeric(10,2) check (week_rate >= 0),
  month_rate            numeric(10,2) check (month_rate >= 0),
  km_included_per_day   integer check (km_included_per_day >= 0),
  extra_km_price        numeric(10,2) check (extra_km_price >= 0),
  deposit               numeric(10,2) not null default 0 check (deposit >= 0),
  franchise             numeric(10,2) check (franchise >= 0),
  fuel_price_per_liter  numeric(10,2) not null default 2.20 check (fuel_price_per_liter >= 0),
  cleaning_fee          numeric(10,2) not null default 45 check (cleaning_fee >= 0),
  late_fee_per_hour     numeric(10,2) not null default 20 check (late_fee_per_hour >= 0),
  -- Échéances
  ct_due_date           date,
  insurance_due_date    date,
  next_service_km       integer check (next_service_km >= 0),
  photo_file_id         uuid references public.files (id) on delete set null,
  in_maintenance        boolean not null default false,
  maintenance_note      text,
  is_active             boolean not null default true,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index fleet_vehicles_plate_key_key on public.fleet_vehicles (plate_key);
comment on table public.fleet_vehicles is 'Flotte du garage : véhicules loués aux clients ou prêtés pendant un OR.';

create type public.fleet_document_kind as enum (
  'registration', 'insurance', 'technical_inspection', 'accident_report', 'maintenance_book', 'fuel_card', 'other'
);

-- Boîte à gants : documents du véhicule (photo ou PDF), aucun n'est obligatoire.
create table public.fleet_documents (
  id                uuid primary key default gen_random_uuid(),
  fleet_vehicle_id  uuid not null references public.fleet_vehicles (id) on delete cascade,
  kind              public.fleet_document_kind not null,
  label             text not null check (btrim(label) <> ''),
  file_id           uuid not null references public.files (id) on delete restrict,
  valid_until       date,
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index fleet_documents_vehicle_idx on public.fleet_documents (fleet_vehicle_id);

create trigger set_updated_at before update on public.fleet_vehicles
  for each row execute function public.set_updated_at();

alter table public.fleet_vehicles enable row level security;
alter table public.fleet_documents enable row level security;

-- Bureau (direction et réception) : gestion complète ; suppression d'un véhicule réservée à la direction.
create policy fleet_vehicles_select on public.fleet_vehicles for select to authenticated using (public.is_office());
create policy fleet_vehicles_insert on public.fleet_vehicles for insert to authenticated with check (public.is_office());
create policy fleet_vehicles_update on public.fleet_vehicles for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy fleet_vehicles_delete on public.fleet_vehicles for delete to authenticated using (public.is_direction());

create policy fleet_documents_select on public.fleet_documents for select to authenticated using (public.is_office());
create policy fleet_documents_insert on public.fleet_documents for insert to authenticated with check (public.is_office());
create policy fleet_documents_update on public.fleet_documents for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy fleet_documents_delete on public.fleet_documents for delete to authenticated using (public.is_office());

-- Raison qui empêche de louer ou prêter le véhicule à une date (null : utilisable).
create or replace function public.fleet_vehicle_block_reason(p_vehicle public.fleet_vehicles, p_on date)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when not p_vehicle.is_active then 'Véhicule retiré de la flotte'
    when p_vehicle.in_maintenance then 'Véhicule en entretien'
    when p_vehicle.insurance_due_date is not null and p_vehicle.insurance_due_date < p_on
      then 'Assurance expirée le ' || to_char(p_vehicle.insurance_due_date, 'DD/MM/YYYY')
    when p_vehicle.ct_due_date is not null and p_vehicle.ct_due_date < p_on
      then 'Contrôle technique expiré le ' || to_char(p_vehicle.ct_due_date, 'DD/MM/YYYY')
  end;
$$;
revoke execute on function public.fleet_vehicle_block_reason(public.fleet_vehicles, date) from public, anon;
grant execute on function public.fleet_vehicle_block_reason(public.fleet_vehicles, date) to authenticated;
