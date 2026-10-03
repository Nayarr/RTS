-- =============================================================================
-- Location — contrats de location et prêts pendant un OR
--
-- Un contrat (LC-AAAA-NNNN) ou un prêt (PR-AAAA-NNNN) réserve un véhicule de la flotte
-- pour un client sur une période (date et heure de départ obligatoires), sans chevauchement.
-- Départ : « remise des clés » contrôlée par la base. Pour une location : permis scanné et
-- valide pour la catégorie du véhicule, signature du client, 4 photos du véhicule et photo
-- du tableau de bord, kilométrage et carburant relevés. Pour un prêt : rien d'obligatoire.
-- Retour : mêmes photos pour une location, puis clôture avec la facture (brouillon modifiable).
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create type public.rental_kind as enum ('rental', 'loan');
create type public.rental_status as enum ('reserved', 'active', 'returned', 'closed', 'cancelled');
create type public.rental_phase as enum ('departure', 'return');
create type public.rental_photo_slot as enum ('front', 'back', 'left', 'right', 'dashboard', 'closeup');

-- Numérotation annuelle : LC-2026-0001 (location), PR-2026-0001 (prêt)
create table public.rental_sequences (
  kind        public.rental_kind not null,
  year        integer not null,
  last_value  integer not null default 0,
  primary key (kind, year)
);
alter table public.rental_sequences enable row level security;
create policy rental_sequences_select on public.rental_sequences for select to authenticated
  using (public.is_office());

create table public.rentals (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null unique,
  kind                  public.rental_kind not null default 'rental',
  status                public.rental_status not null default 'reserved',
  client_id             uuid not null references public.clients (id) on delete restrict,
  driving_license_id    uuid references public.driving_licenses (id) on delete set null,
  fleet_vehicle_id      uuid not null references public.fleet_vehicles (id) on delete restrict,
  repair_order_id       uuid references public.repair_orders (id) on delete set null,
  departure_at          timestamptz not null,
  planned_return_at     timestamptz not null,
  departed_at           timestamptz,               -- clés remises
  returned_at           timestamptz,
  -- Conditions (copiées du véhicule à la création, modifiables avant le départ)
  rate_period           text not null default 'day' check (rate_period in ('day', 'weekend', 'week', 'month')),
  unit_price            numeric(10,2) not null default 0 check (unit_price >= 0),
  periods               numeric(6,2) not null default 1 check (periods > 0),
  discount_percent      numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  km_included           integer check (km_included >= 0),
  extra_km_price        numeric(10,2) check (extra_km_price >= 0),
  fuel_price_per_liter  numeric(10,2) check (fuel_price_per_liter >= 0),
  cleaning_fee          numeric(10,2) check (cleaning_fee >= 0),
  late_fee_per_hour     numeric(10,2) check (late_fee_per_hour >= 0),
  deposit               numeric(10,2) not null default 0 check (deposit >= 0),
  deposit_mode          text check (deposit_mode in ('card_hold', 'cheque', 'cash', 'transfer')),
  franchise             numeric(10,2) check (franchise >= 0),
  billable              boolean not null default true,  -- prêt : gratuit (false) ou facturé
  -- Signature du client (location)
  terms_accepted        boolean not null default false,
  signature_file_id     uuid references public.files (id) on delete set null,
  signed_at             timestamptz,
  notes                 text,
  invoice_id            uuid references public.invoices (id) on delete set null,
  closed_at             timestamptz,
  created_by            uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (planned_return_at > departure_at),
  check (returned_at is null or departed_at is not null),
  -- Un véhicule n'est jamais réservé ou sorti deux fois sur la même période
  constraint rentals_no_overlap exclude using gist (
    fleet_vehicle_id with =,
    tstzrange(departure_at, planned_return_at) with &&
  ) where (status in ('reserved', 'active'))
);
create index rentals_client_idx on public.rentals (client_id);
create index rentals_vehicle_idx on public.rentals (fleet_vehicle_id);
create index rentals_repair_order_idx on public.rentals (repair_order_id) where repair_order_id is not null;
comment on table public.rentals is 'Locations (LC-) et prêts pendant un OR (PR-) des véhicules de la flotte.';

-- États des lieux : kilométrage, carburant (en huitièmes), équipements, propreté
create table public.rental_inspections (
  id             uuid primary key default gen_random_uuid(),
  rental_id      uuid not null references public.rentals (id) on delete cascade,
  phase          public.rental_phase not null,
  mileage        integer check (mileage >= 0),
  fuel_eighths   smallint check (fuel_eighths between 0 and 8),
  equipment      text[] not null default '{}',
  clean          boolean,
  notes          text,
  inspected_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  inspected_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (rental_id, phase)
);

create table public.rental_photos (
  id          uuid primary key default gen_random_uuid(),
  rental_id   uuid not null references public.rentals (id) on delete cascade,
  phase       public.rental_phase not null,
  slot        public.rental_photo_slot not null,
  file_id     uuid not null references public.files (id) on delete restrict,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create unique index rental_photos_slot_key on public.rental_photos (rental_id, phase, slot) where slot <> 'closeup';
create index rental_photos_rental_idx on public.rental_photos (rental_id);

-- Dommages placés sur le schéma (x, y entre 0 et 1), notés au départ ou au retour
create table public.rental_damages (
  id             uuid primary key default gen_random_uuid(),
  rental_id      uuid not null references public.rentals (id) on delete cascade,
  phase          public.rental_phase not null,
  x              numeric(4,3) not null check (x between 0 and 1),
  y              numeric(4,3) not null check (y between 0 and 1),
  label          text not null check (btrim(label) <> ''),
  photo_file_id  uuid references public.files (id) on delete set null,
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index rental_damages_rental_idx on public.rental_damages (rental_id);

-- Facture issue d'une location : pas de ligne « Fournitures et recyclage »
alter table public.invoices add column rental_id uuid references public.rentals (id) on delete set null;
create index invoices_rental_idx on public.invoices (rental_id) where rental_id is not null;

create or replace function public.add_supplies_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vat numeric;
  v_fee numeric;
begin
  select default_vat_rate, supplies_fee_ht into v_vat, v_fee from public.company_settings;
  if coalesce(v_fee, 0) <= 0 then
    return null;
  end if;
  if tg_table_name = 'quotes' then
    if new.legacy_id is null then
      insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity, vat_rate)
      values (new.id, 'planned', 1000, 'consumable', 'Fournitures et recyclage', v_fee, 1, coalesce(v_vat, 20));
    end if;
  elsif new.maintenance_contract_id is null and new.rental_id is null
        and not new.is_legacy_import and new.legacy_id is null then
    insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
    values (new.id, 1000, 'consumable', 'Fournitures et recyclage', v_fee, 1, coalesce(v_vat, 20));
  end if;
  return null;
end;
$$;
revoke execute on function public.add_supplies_line() from public, anon, authenticated;

-- ---------------------------------------------------------------- Numéro et garde-fous

create or replace function public.rental_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_last integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'reserved' then
      raise exception 'Un contrat commence toujours réservé' using errcode = '22023';
    end if;
    v_year := extract(year from public.paris_date(new.departure_at))::integer;
    insert into public.rental_sequences as s (kind, year, last_value) values (new.kind, v_year, 1)
    on conflict (kind, year) do update set last_value = s.last_value + 1
    returning last_value into v_last;
    new.number := case new.kind when 'rental' then 'LC-' else 'PR-' end
                  || v_year || '-' || lpad(v_last::text, 4, '0');
    return new;
  end if;

  if new.number is distinct from old.number or new.kind is distinct from old.kind then
    raise exception 'Le numéro et le type du contrat ne changent pas' using errcode = '22023';
  end if;
  -- Les changements de statut passent par les fonctions (départ, retour, clôture, annulation)
  if new.status is distinct from old.status
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'Statut du contrat modifié seulement par le départ, le retour ou la clôture'
      using errcode = '42501';
  end if;
  -- Après le départ, les conditions et la période de départ sont figées (seuls retour prévu et notes bougent)
  if old.status <> 'reserved' and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' and (
       new.client_id, new.fleet_vehicle_id, new.driving_license_id, new.departure_at, new.rate_period,
       new.unit_price, new.periods, new.discount_percent, new.km_included, new.extra_km_price,
       new.fuel_price_per_liter, new.cleaning_fee, new.late_fee_per_hour, new.deposit, new.franchise,
       new.billable, new.signature_file_id, new.signed_at
     ) is distinct from (
       old.client_id, old.fleet_vehicle_id, old.driving_license_id, old.departure_at, old.rate_period,
       old.unit_price, old.periods, old.discount_percent, old.km_included, old.extra_km_price,
       old.fuel_price_per_liter, old.cleaning_fee, old.late_fee_per_hour, old.deposit, old.franchise,
       old.billable, old.signature_file_id, old.signed_at
     ) then
    raise exception 'Contrat déjà parti : les conditions ne se modifient plus' using errcode = '42501';
  end if;
  if old.status in ('closed', 'cancelled')
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'Contrat clôturé ou annulé : plus modifiable' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.rental_before_write() from public, anon, authenticated;

create trigger rental_before_write before insert or update on public.rentals
  for each row execute function public.rental_before_write();
create trigger set_updated_at before update on public.rentals
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.rental_inspections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- Droits (bureau)

alter table public.rentals enable row level security;
alter table public.rental_inspections enable row level security;
alter table public.rental_photos enable row level security;
alter table public.rental_damages enable row level security;

create policy rentals_select on public.rentals for select to authenticated using (public.is_office());
create policy rentals_insert on public.rentals for insert to authenticated with check (public.is_office());
create policy rentals_update on public.rentals for update to authenticated
  using (public.is_office()) with check (public.is_office());

-- Phase modifiable tant qu'elle est en cours : départ avant la remise des clés, retour avant le retour enregistré
create or replace function public.rental_phase_open(p_rental_id uuid, p_phase public.rental_phase)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rentals r
    where r.id = p_rental_id
      and r.status = case p_phase when 'departure' then 'reserved'::public.rental_status
                                  else 'active'::public.rental_status end
  );
$$;
revoke execute on function public.rental_phase_open(uuid, public.rental_phase) from public, anon;
grant execute on function public.rental_phase_open(uuid, public.rental_phase) to authenticated;

create policy rental_inspections_select on public.rental_inspections for select to authenticated
  using (public.is_office());
create policy rental_inspections_insert on public.rental_inspections for insert to authenticated
  with check (public.is_office() and public.rental_phase_open(rental_id, phase));
create policy rental_inspections_update on public.rental_inspections for update to authenticated
  using (public.is_office() and public.rental_phase_open(rental_id, phase))
  with check (public.is_office() and public.rental_phase_open(rental_id, phase));

create policy rental_photos_select on public.rental_photos for select to authenticated using (public.is_office());
create policy rental_photos_insert on public.rental_photos for insert to authenticated
  with check (public.is_office() and public.rental_phase_open(rental_id, phase));
create policy rental_photos_delete on public.rental_photos for delete to authenticated
  using (public.is_office() and public.rental_phase_open(rental_id, phase));

create policy rental_damages_select on public.rental_damages for select to authenticated using (public.is_office());
create policy rental_damages_insert on public.rental_damages for insert to authenticated
  with check (public.is_office() and public.rental_phase_open(rental_id, phase));
create policy rental_damages_delete on public.rental_damages for delete to authenticated
  using (public.is_office() and public.rental_phase_open(rental_id, phase));

-- ---------------------------------------------------------------- Ce qui manque

-- Éléments obligatoires manquants pour le départ (remise des clés) ou le retour, lisibles par le comptoir.
create or replace function public.rental_missing(p_rental_id uuid, p_phase public.rental_phase)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_vehicle public.fleet_vehicles;
  v_license public.driving_licenses;
  v_inspection public.rental_inspections;
  v_missing text[] := '{}'::text[];
  v_reason text;
  v_slot public.rental_photo_slot;
  v_labels jsonb := '{"front": "Photo avant", "back": "Photo arrière", "left": "Photo côté gauche",
                      "right": "Photo côté droit", "dashboard": "Photo du tableau de bord"}'::jsonb;
  v_engine boolean;
begin
  if not public.is_office() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;
  select * into v_rental from public.rentals where id = p_rental_id;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  select * into v_vehicle from public.fleet_vehicles where id = v_rental.fleet_vehicle_id;
  v_engine := v_vehicle.category <> 'trailer';
  select * into v_inspection from public.rental_inspections where rental_id = p_rental_id and phase = p_phase;

  if p_phase = 'departure' then
    v_reason := public.fleet_vehicle_block_reason(v_vehicle, public.paris_date(v_rental.departure_at));
    if v_reason is not null then
      v_missing := v_missing || v_reason;
    end if;
  end if;

  if v_rental.kind = 'loan' then
    return v_missing;  -- prêt : photos et relevés conseillés, pas obligatoires
  end if;

  if p_phase = 'departure' then
    select * into v_license from public.driving_licenses where id = v_rental.driving_license_id;
    if not found or v_license.client_id <> v_rental.client_id then
      v_missing := v_missing || 'Permis de conduire scanné'::text;
    else
      v_reason := public.license_block_reason(v_license, v_vehicle.license_category,
                                              public.paris_date(v_rental.planned_return_at));
      if v_reason is not null then
        v_missing := v_missing || v_reason;
      end if;
    end if;
    if v_rental.signed_at is null or v_rental.signature_file_id is null then
      v_missing := v_missing || 'Signature du client'::text;
    end if;
  end if;

  foreach v_slot in array array['front', 'back', 'left', 'right', 'dashboard']::public.rental_photo_slot[] loop
    if not exists (select 1 from public.rental_photos p
                   where p.rental_id = p_rental_id and p.phase = p_phase and p.slot = v_slot) then
      v_missing := v_missing || (v_labels ->> v_slot::text);
    end if;
  end loop;

  if v_engine then
    if v_inspection.mileage is null then
      v_missing := v_missing || 'Kilométrage'::text;
    end if;
    if v_inspection.fuel_eighths is null then
      v_missing := v_missing || 'Niveau de carburant'::text;
    end if;
  end if;
  return v_missing;
end;
$$;
revoke execute on function public.rental_missing(uuid, public.rental_phase) from public, anon;
grant execute on function public.rental_missing(uuid, public.rental_phase) to authenticated;

-- ---------------------------------------------------------------- Départ, retour, clôture, annulation

create or replace function public.start_rental(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_missing text[];
begin
  perform public.assert_office();
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_rental.status <> 'reserved' then
    raise exception 'Les clés de ce contrat ont déjà été remises' using errcode = 'P0001';
  end if;
  v_missing := public.rental_missing(p_rental_id, 'departure');
  if cardinality(v_missing) > 0 then
    raise exception 'Impossible de remettre les clés : %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;
  perform set_config('rts.rental_transition', 'on', true);
  update public.rentals set status = 'active', departed_at = now() where id = p_rental_id;
  perform set_config('rts.rental_transition', '', true);
end;
$$;

create or replace function public.return_rental(p_rental_id uuid, p_returned_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_missing text[];
  v_out integer;
  v_in integer;
begin
  perform public.assert_office();
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_rental.status <> 'active' then
    raise exception 'Ce véhicule n’est pas sorti' using errcode = 'P0001';
  end if;
  if p_returned_at is null then
    raise exception 'Indique la date et l’heure de retour' using errcode = '22023';
  end if;
  if p_returned_at < v_rental.departed_at - interval '1 day' or p_returned_at > now() + interval '1 hour' then
    raise exception 'Date de retour impossible' using errcode = '22023';
  end if;
  v_missing := public.rental_missing(p_rental_id, 'return');
  if cardinality(v_missing) > 0 then
    raise exception 'Retour incomplet : %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;
  select mileage into v_out from public.rental_inspections where rental_id = p_rental_id and phase = 'departure';
  select mileage into v_in from public.rental_inspections where rental_id = p_rental_id and phase = 'return';
  if v_in < v_out then
    raise exception 'Kilométrage de retour inférieur à celui du départ' using errcode = '22023';
  end if;

  perform set_config('rts.rental_transition', 'on', true);
  update public.rentals set status = 'returned', returned_at = p_returned_at where id = p_rental_id;
  perform set_config('rts.rental_transition', '', true);
  -- Compteur du véhicule mis à jour
  update public.fleet_vehicles set mileage = greatest(coalesce(mileage, 0), v_in)
   where id = v_rental.fleet_vehicle_id and v_in is not null;
end;
$$;

-- Clôture : facture en brouillon avec les lignes retenues au comptoir (aucune ligne : prêt gratuit).
create or replace function public.close_rental(p_rental_id uuid, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_vehicle public.fleet_vehicles;
  v_invoice_id uuid;
  v_line jsonb;
  v_position integer := 0;
  v_vat numeric := (select default_vat_rate from public.company_settings);
begin
  perform public.assert_office();
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_rental.status <> 'returned' then
    raise exception 'Enregistre d’abord le retour du véhicule' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]')) <> 'array' then
    raise exception 'Lignes de facture invalides' using errcode = '22023';
  end if;
  select * into v_vehicle from public.fleet_vehicles where id = v_rental.fleet_vehicle_id;

  if jsonb_array_length(coalesce(p_lines, '[]')) > 0 then
    insert into public.invoices (client_id, vehicle_label, service_date, mileage, rental_id, created_by)
    values (v_rental.client_id, v_vehicle.plate || ' · ' || v_vehicle.brand || ' ' || v_vehicle.model,
            public.paris_date(v_rental.returned_at),
            (select mileage from public.rental_inspections where rental_id = p_rental_id and phase = 'return'),
            p_rental_id, auth.uid())
    returning id into v_invoice_id;

    for v_line in select * from jsonb_array_elements(p_lines) loop
      if btrim(coalesce(v_line ->> 'description', '')) = '' then
        raise exception 'Chaque ligne a besoin d’une désignation' using errcode = '22023';
      end if;
      insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
      values (v_invoice_id, v_position, 'rental', btrim(v_line ->> 'description'),
              round((v_line ->> 'unit_price')::numeric, 2), (v_line ->> 'quantity')::numeric,
              coalesce(v_vat, 20));
      v_position := v_position + 1;
    end loop;
  end if;

  perform set_config('rts.rental_transition', 'on', true);
  update public.rentals set status = 'closed', closed_at = now(), invoice_id = v_invoice_id where id = p_rental_id;
  perform set_config('rts.rental_transition', '', true);
  return v_invoice_id;
end;
$$;

create or replace function public.cancel_rental(p_rental_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_office();
  perform set_config('rts.rental_transition', 'on', true);
  update public.rentals set status = 'cancelled' where id = p_rental_id and status = 'reserved';
  if not found then
    raise exception 'Seul un contrat réservé (clés pas encore remises) peut être annulé' using errcode = 'P0001';
  end if;
  perform set_config('rts.rental_transition', '', true);
end;
$$;

revoke execute on function public.start_rental(uuid), public.return_rental(uuid, timestamptz),
  public.close_rental(uuid, jsonb), public.cancel_rental(uuid) from public, anon;
grant execute on function public.start_rental(uuid), public.return_rental(uuid, timestamptz),
  public.close_rental(uuid, jsonb), public.cancel_rental(uuid) to authenticated;

-- ---------------------------------------------------------------- Liste des contrats

create view public.v_rentals_overview
with (security_invoker = on) as
select
  r.*,
  c.name as client_name,
  c.kind as client_kind,
  c.phone as client_phone,
  v.plate,
  v.brand,
  v.model,
  v.category,
  ro.number as repair_order_number,
  i.number as invoice_number,
  (r.status = 'active' and r.planned_return_at < now()) as is_late,
  round(r.unit_price * r.periods * (1 - r.discount_percent / 100), 2) as estimated_ht
from public.rentals r
join public.clients c on c.id = r.client_id
join public.fleet_vehicles v on v.id = r.fleet_vehicle_id
left join public.repair_orders ro on ro.id = r.repair_order_id
left join public.invoices i on i.id = r.invoice_id;

revoke all on public.v_rentals_overview from public, anon;
grant select on public.v_rentals_overview to authenticated;
