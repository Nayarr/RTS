-- =============================================================================
-- Location : clients particuliers et permis de conduire
--
-- Un client est désormais professionnel (raison sociale, SIREN) ou particulier (civilité,
-- nom, prénom, date et lieu de naissance). Le nom affiché d'un particulier est « Prénom Nom ».
-- Les permis de conduire (recto et verso photographiés, lus automatiquement puis vérifiés)
-- sont rattachés au client : le sien pour un particulier, ceux de ses conducteurs pour un pro.
-- Un permis complet (recto, verso, catégorie, validité) est exigé pour louer un véhicule.
-- =============================================================================

create type public.client_kind as enum ('pro', 'individual');

alter table public.clients
  add column kind        public.client_kind not null default 'pro',
  add column civility    text check (civility in ('M.', 'Mme')),
  add column first_name  text,
  add column last_name   text,
  add column birth_date  date,
  add column birth_place text,
  add constraint clients_individual_identity_check check (
    kind = 'pro' or (btrim(coalesce(first_name, '')) <> '' and btrim(coalesce(last_name, '')) <> '')
  );

comment on column public.clients.kind is 'Professionnel (raison sociale) ou particulier (identité, permis).';

-- Nom affiché d'un particulier : « Prénom Nom », tenu à jour par la base.
create or replace function public.client_individual_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'individual' then
    new.name := concat_ws(' ', nullif(btrim(new.first_name), ''), nullif(btrim(new.last_name), ''));
  end if;
  return new;
end;
$$;
revoke execute on function public.client_individual_name() from public, anon;

create trigger client_individual_name before insert or update on public.clients
  for each row execute function public.client_individual_name();

-- La liste des clients reprend les nouvelles colonnes (c.* est figé à la création de la vue).
drop view public.v_clients_overview;
create view public.v_clients_overview
with (security_invoker = on) as
select
  c.*,
  coalesce(v.count, 0) as vehicles_count,
  coalesce(r.count, 0) as orders_count,
  r.last_visit,
  coalesce(i.revenue_ht, 0) as revenue_ht,
  coalesce(i.balance_due, 0) as balance_due,
  coalesce(i.overdue_count, 0) as overdue_invoices_count
from public.clients c
left join lateral (
  select count(*) as count from public.vehicles where client_id = c.id
) v on true
left join lateral (
  select count(*) as count, max(created_at) as last_visit from public.repair_orders where client_id = c.id
) r on true
left join lateral (
  select sum(t.total_ht) as revenue_ht,
         sum(greatest(b.balance_due, 0)) as balance_due,
         count(*) filter (where b.payment_status = 'overdue') as overdue_count
  from public.invoices inv
  join public.v_invoice_totals t on t.invoice_id = inv.id
  left join public.v_invoice_balances b on b.invoice_id = inv.id
  where inv.client_id = c.id and inv.status = 'issued'
) i on true;

revoke all on public.v_clients_overview from public, anon;
grant select on public.v_clients_overview to authenticated;

-- ---------------------------------------------------------------- Permis de conduire

create table public.driving_licenses (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients (id) on delete cascade,
  last_name       text not null check (btrim(last_name) <> ''),
  first_name      text not null check (btrim(first_name) <> ''),
  birth_date      date,
  birth_place     text,
  license_number  text check (license_number is null or license_number ~ '^[A-Z0-9]{6,20}$'),
  categories      text[] not null default '{}' check (
    categories <@ array['AM', 'A1', 'A2', 'A', 'B1', 'B', 'BE', 'C1', 'C1E', 'C', 'CE', 'D1', 'D1E', 'D', 'DE']
  ),
  issued_on       date,
  valid_until     date,
  recto_file_id   uuid references public.files (id) on delete set null,
  verso_file_id   uuid references public.files (id) on delete set null,
  read_automatically boolean not null default false,  -- champs remplis par la lecture du scan
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (valid_until is null or issued_on is null or valid_until > issued_on)
);
create index driving_licenses_client_idx on public.driving_licenses (client_id);
comment on table public.driving_licenses is
  'Permis de conduire scannés : celui d’un client particulier ou ceux des conducteurs d’un client pro.';

create trigger set_updated_at before update on public.driving_licenses
  for each row execute function public.set_updated_at();

alter table public.driving_licenses enable row level security;

create policy driving_licenses_select on public.driving_licenses for select to authenticated
  using (public.is_office());
create policy driving_licenses_insert on public.driving_licenses for insert to authenticated
  with check (public.is_office());
create policy driving_licenses_update on public.driving_licenses for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy driving_licenses_delete on public.driving_licenses for delete to authenticated
  using (public.is_office());

-- Le permis couvre-t-il la catégorie demandée ? (C couvre C1, CE couvre C1E et BE, C1E couvre BE)
create or replace function public.license_covers(p_categories text[], p_required text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_required = any (p_categories)
    or (p_required = 'C1' and 'C' = any (p_categories))
    or (p_required in ('C1E', 'BE') and 'CE' = any (p_categories))
    or (p_required = 'BE' and 'C1E' = any (p_categories));
$$;
revoke execute on function public.license_covers(text[], text) from public, anon;
grant execute on function public.license_covers(text[], text) to authenticated;

-- Ce qui empêche ce permis de servir pour une location (null : utilisable) : scan incomplet,
-- catégorie non couverte, permis expiré avant la fin de la location.
create or replace function public.license_block_reason(
  p_license public.driving_licenses,
  p_required text,
  p_until date
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_license.recto_file_id is null or p_license.verso_file_id is null
      then 'Permis à scanner (recto et verso)'
    when p_license.license_number is null then 'Numéro de permis manquant'
    when not public.license_covers(p_license.categories, p_required)
      then 'Permis ' || p_required || ' requis'
    when p_license.valid_until is not null and p_license.valid_until < p_until
      then 'Permis expiré le ' || to_char(p_license.valid_until, 'DD/MM/YYYY')
  end;
$$;
revoke execute on function public.license_block_reason(public.driving_licenses, text, date) from public, anon;
grant execute on function public.license_block_reason(public.driving_licenses, text, date) to authenticated;
