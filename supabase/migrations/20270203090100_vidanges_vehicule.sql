-- Vidanges déclarées d'un véhicule (faites ailleurs, dites par le client à la création de l'OR) :
-- date et kilométrage facultatif, affichées dans l'historique de la fiche véhicule. Avec les
-- vidanges faites à l'atelier (lignes des OR), elles servent à proposer la prochaine vidange.

create table public.vehicle_oil_changes (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  done_on     date not null,
  mileage     integer constraint vehicle_oil_changes_mileage_check check (mileage is null or mileage >= 0),
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  constraint vehicle_oil_changes_done_on_check check (done_on <= current_date + 1)
);
create index vehicle_oil_changes_vehicle_idx on public.vehicle_oil_changes (vehicle_id, done_on desc);
comment on table public.vehicle_oil_changes is
  'Vidanges déclarées (faites hors atelier) : date, kilométrage facultatif.';

alter table public.vehicle_oil_changes enable row level security;
create policy vehicle_oil_changes_select on public.vehicle_oil_changes for select to authenticated
  using (public.is_office());
create policy vehicle_oil_changes_insert on public.vehicle_oil_changes for insert to authenticated
  with check (public.is_office());
create policy vehicle_oil_changes_delete on public.vehicle_oil_changes for delete to authenticated
  using (public.is_office());
grant select, insert, delete on public.vehicle_oil_changes to authenticated;
