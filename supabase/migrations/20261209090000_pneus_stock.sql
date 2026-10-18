-- =============================================================================
-- RTS Atelier : stock des pneumatiques
--
-- - Le stock se compte par taille et par profil (tire_lines) : avant, arrière ou remorque pour un
--   poids lourd, toutes positions pour un utilitaire. La marque et le fournisseur ne changent pas
--   le compte : chaque arrivage est un lot (tires) rangé sous sa ligne.
-- - Chaque ligne a son stock mini : sous ce seuil (stock disponible = en stock - réservé), la
--   direction et la réception sont prévenues (cloche et push), une fois par jour au plus.
-- - Chaque lot a sa pièce du catalogue (parts.is_tire) : un pneu mis au devis passe à l'OR et à la
--   facture comme une pièce. Les pneus au devis ou sur l'OR sont réservés ; ils sortent du stock
--   quand la facture est émise.
-- - Mouvements gardés (tire_movements) : entrées fournisseur, ventes, corrections avec motif.
-- =============================================================================

create type public.tire_category as enum ('pl', 'vul');
-- avant = directeur, arriere = moteur, remorque, toutes = utilitaire (toutes positions)
create type public.tire_profile as enum ('avant', 'arriere', 'remorque', 'toutes');
create type public.tire_condition as enum ('neuf', 'rechape', 'occasion');
create type public.tire_movement_reason as enum ('entry', 'sale', 'correction');

-- Taille mise en forme : « 31580225 », « 315/80/22.5 » → « 315/80 R22.5 » ; « 2356516C » → « 235/65 R16C »
create function public.tire_size_label(p_size text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when length(d) = 8 then substr(d, 1, 3) || '/' || substr(d, 4, 2) || ' R' || substr(d, 6, 2) || '.' || substr(d, 8, 1)
    when length(d) = 7 then substr(d, 1, 3) || '/' || substr(d, 4, 2) || ' R' || substr(d, 6, 2)
  end || case when upper(btrim(coalesce(p_size, ''))) ~ 'C$' then 'C' else '' end
  from (select regexp_replace(coalesce(p_size, ''), '\D', '', 'g') as d) s;
$$;

-- Clé de comparaison d'une taille (chiffres seuls) : même clé pour la fiche de contrôle et le stock
create function public.tire_size_key(p_size text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_size, ''), '\D', '', 'g');
$$;

create table public.tire_brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  name_key    text generated always as (public.normalize_key(name)) stored,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index tire_brands_name_key_key on public.tire_brands (name_key);
comment on table public.tire_brands is 'Marques de pneus proposées à l''entrée en stock.';

create table public.tire_lines (
  id          uuid primary key default gen_random_uuid(),
  category    public.tire_category not null,
  size        text not null check (public.tire_size_label(size) = size),
  size_key    text generated always as (public.tire_size_key(size)) stored,
  profile     public.tire_profile not null,
  min_qty     integer not null default 0 check (min_qty >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tire_lines_profile_check check ((category = 'vul') = (profile = 'toutes'))
);
create unique index tire_lines_key on public.tire_lines (category, size_key, profile);
comment on table public.tire_lines is 'Stock des pneus compté par taille et profil, avec son stock mini.';

create table public.tires (
  id              uuid primary key default gen_random_uuid(),
  line_id         uuid not null references public.tire_lines (id) on delete restrict,
  brand_id        uuid not null references public.tire_brands (id) on delete restrict,
  model           text not null default '',
  condition       public.tire_condition not null default 'neuf',
  load_index      text,                  -- indices de charge et de vitesse (« 156/150 L »)
  location        text,                  -- emplacement (« Rack A1 »)
  dot             text,                  -- semaine et année de fabrication (« 24/2026 »)
  supplier_id     uuid references public.suppliers (id) on delete set null,
  purchase_price  numeric(12,2) check (purchase_price >= 0),   -- prix d'achat HT du pneu (dernier arrivage)
  sale_price      numeric(12,2) check (sale_price >= 0),       -- prix de vente HT du pneu
  stock_qty       integer not null default 0,                  -- tenu à jour par tire_movements
  part_id         uuid unique references public.parts (id) on delete set null,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index tires_lot_key on public.tires (line_id, brand_id, lower(btrim(model)), condition) where is_active;
create index tires_brand_idx on public.tires (brand_id);
comment on table public.tires is 'Lots de pneus (marque, modèle, état) rangés sous une ligne de stock.';

create table public.tire_movements (
  id                   uuid primary key default gen_random_uuid(),
  tire_id              uuid not null references public.tires (id) on delete cascade,
  quantity             integer not null check (quantity <> 0),   -- négatif = sortie
  reason               public.tire_movement_reason not null,
  supplier_id          uuid references public.suppliers (id) on delete set null,
  reference            text,                                     -- bon de livraison
  unit_purchase_price  numeric(12,2),
  unit_sale_price      numeric(12,2),
  repair_order_id      uuid references public.repair_orders (id) on delete set null,
  invoice_id           uuid references public.invoices (id) on delete set null,
  note                 text,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index tire_movements_tire_idx on public.tire_movements (tire_id, created_at desc);
create index tire_movements_sales_idx on public.tire_movements (created_at) where reason = 'sale';
create unique index tire_movements_invoice_key on public.tire_movements (invoice_id, tire_id) where reason = 'sale';
comment on table public.tire_movements is 'Entrées, ventes et corrections du stock des pneus (source du stock).';

-- Pièces des lots de pneus : hors du catalogue des pièces
alter table public.parts add column is_tire boolean not null default false;
comment on column public.parts.is_tire is 'Pièce d''un lot de pneus (stock des pneumatiques) : pas dans la liste des pièces.';

create trigger set_updated_at before update on public.tire_brands for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tire_lines for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tires for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pièce du lot : désignation, marque, prix et fournisseur repris
-- ---------------------------------------------------------------------------

create function public.tires_sync_part()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_designation text;
  v_brand text;
  v_margin numeric;
begin
  select b.name into v_brand from public.tire_brands b where b.id = new.brand_id;
  select btrim(concat_ws(' ', 'Pneu', v_brand, nullif(btrim(new.model), ''), l.size,
                         case new.condition when 'rechape' then 'rechapé' when 'occasion' then 'occasion' end))
    into v_designation
  from public.tire_lines l where l.id = new.line_id;
  v_margin := case when new.purchase_price > 0 and new.sale_price is not null
                   then round((new.sale_price - new.purchase_price) / new.purchase_price * 100, 2) end;

  if new.part_id is null then
    insert into public.parts (designation, brand, supplier_id, purchase_price, sale_price, margin_kind,
                              margin_value, is_active, is_tire)
    values (v_designation, v_brand, new.supplier_id, new.purchase_price, new.sale_price, 'percent',
            greatest(v_margin, 0), new.is_active, true)
    returning id into new.part_id;
  else
    update public.parts
       set designation = v_designation, brand = v_brand, supplier_id = new.supplier_id,
           purchase_price = new.purchase_price, sale_price = new.sale_price,
           margin_kind = 'percent', margin_value = greatest(v_margin, 0), is_active = new.is_active
     where id = new.part_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.tires_sync_part() from public, anon, authenticated;

create trigger tires_sync_part
  before insert or update of line_id, brand_id, model, condition, supplier_id, purchase_price, sale_price,
    is_active on public.tires
  for each row execute function public.tires_sync_part();

-- Marque renommée : désignation des pièces de ses lots
create function public.tire_brands_sync_parts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tires set brand_id = brand_id where brand_id = new.id;
  return null;
end;
$$;
revoke execute on function public.tire_brands_sync_parts() from public, anon, authenticated;

create trigger tire_brands_sync_parts
  after update of name on public.tire_brands
  for each row when (old.name is distinct from new.name) execute function public.tire_brands_sync_parts();

-- ---------------------------------------------------------------------------
-- Réservations : pneus au devis, sur l'OR ou sur une facture à émettre
-- ---------------------------------------------------------------------------

create view public.v_tire_reservations
with (security_invoker = on) as
-- Devis en cours (lignes ajoutées au devis, pas encore passées sur un OR)
select t.id as tire_id, ql.quantity, q.repair_order_id, q.id as quote_id, null::uuid as invoice_id
from public.quote_lines ql
join public.quotes q on q.id = ql.quote_id
join public.tires t on t.part_id = ql.part_id
where q.status in ('draft', 'in_progress', 'sent', 'accepted')
  and ql.source_ro_line_id is null
  and coalesce(ql.done_line_decision, 'billed') = 'billed'
  and not exists (select 1 from public.ro_lines rl where rl.source_quote_line_id = ql.id)
  and not exists (select 1 from public.invoice_lines il where il.source_quote_line_id = ql.id)
union all
-- OR pas encore facturé
select t.id, rl.quantity, rl.repair_order_id, null, null
from public.ro_lines rl
join public.repair_orders r on r.id = rl.repair_order_id
join public.tires t on t.part_id = rl.part_id
where r.status <> 'invoiced'
  and not exists (select 1 from public.invoice_lines il
                  join public.invoices i on i.id = il.invoice_id
                  where il.source_ro_line_id = rl.id and i.status = 'issued')
union all
-- Facture à émettre, pneu ajouté directement sur la facture
select t.id, il.quantity, il.repair_order_id, null, il.invoice_id
from public.invoice_lines il
join public.invoices i on i.id = il.invoice_id
join public.tires t on t.part_id = il.part_id
where i.status = 'draft' and il.source_ro_line_id is null and il.source_quote_line_id is null;
comment on view public.v_tire_reservations is 'Pneus réservés : au devis, sur un OR pas encore facturé, sur une facture à émettre.';

-- ---------------------------------------------------------------------------
-- Lots et lignes du stock
-- ---------------------------------------------------------------------------

create view public.v_tire_lots
with (security_invoker = on) as
select
  t.id, t.line_id, l.category, l.size, l.size_key, l.profile, t.brand_id, b.name as brand_name, t.model,
  t.condition, t.load_index, t.location, t.dot, t.supplier_id, sp.name as supplier_name, t.purchase_price,
  t.sale_price, t.stock_qty, coalesce(r.reserved, 0)::integer as reserved_qty,
  (t.stock_qty - coalesce(r.reserved, 0))::integer as available_qty, t.part_id, t.is_active, t.created_at,
  coalesce(s.sold_90d, 0)::integer as sold_90d
from public.tires t
join public.tire_lines l on l.id = t.line_id
join public.tire_brands b on b.id = t.brand_id
left join public.suppliers sp on sp.id = t.supplier_id
left join lateral (select sum(v.quantity) as reserved from public.v_tire_reservations v where v.tire_id = t.id) r on true
left join lateral (
  select -sum(m.quantity) as sold_90d from public.tire_movements m
  where m.tire_id = t.id and m.reason = 'sale' and m.created_at >= now() - interval '90 days'
) s on true;

create view public.v_tire_lines
with (security_invoker = on) as
select
  l.id, l.category, l.size, l.size_key, l.profile, l.min_qty,
  coalesce(a.stock, 0)::integer as stock_qty,
  coalesce(a.reserved, 0)::integer as reserved_qty,
  (coalesce(a.stock, 0) - coalesce(a.reserved, 0))::integer as available_qty,
  greatest(l.min_qty - (coalesce(a.stock, 0) - coalesce(a.reserved, 0)), 0)::integer as missing_qty,
  case when l.min_qty = 0 then 'ok'
       when coalesce(a.stock, 0) - coalesce(a.reserved, 0) <= 0 then 'out'
       when coalesce(a.stock, 0) - coalesce(a.reserved, 0) < l.min_qty then 'to_order'
       else 'ok' end as status,
  coalesce(a.lots, 0)::integer as lots_count,
  a.brands,
  a.avg_purchase_price,
  coalesce(s.sold, 0)::integer as sold_30d
from public.tire_lines l
left join lateral (
  select sum(t.stock_qty) as stock, sum(t.reserved_qty) as reserved,
         count(*) filter (where t.stock_qty > 0) as lots,
         -- « Michelin 8 · Hankook 4 » : marques en stock, la plus fournie d'abord
         (select string_agg(x.brand_name || ' ' || x.qty, ' · ' order by x.qty desc, x.brand_name)
            from (select v.brand_name, sum(v.stock_qty) as qty from public.v_tire_lots v
                  where v.line_id = l.id and v.is_active and v.stock_qty > 0 group by v.brand_name) x) as brands,
         -- Prix d'achat moyen pondéré par le stock (sinon moyenne des lots)
         round(coalesce(sum(t.purchase_price * t.stock_qty) filter (where t.stock_qty > 0)
                          / nullif(sum(t.stock_qty) filter (where t.stock_qty > 0 and t.purchase_price is not null), 0),
                        avg(t.purchase_price)), 2) as avg_purchase_price
  from public.v_tire_lots t where t.line_id = l.id and t.is_active
) a on true
left join lateral (
  select -sum(m.quantity) as sold from public.tire_movements m
  join public.tires t on t.id = m.tire_id
  where t.line_id = l.id and m.reason = 'sale' and m.created_at >= now() - interval '30 days'
) s on true;
comment on view public.v_tire_lines is 'Stock des pneus par taille et profil : disponible, seuil, état (ok, à commander, rupture), ventes.';

-- Indicateurs du stock : pneus en stock, lignes sous le seuil, ventes et marge sur 30 jours
create function public.tire_stock_kpis()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with sales as (
    select m.created_at >= now() - interval '30 days' as is_current, -m.quantity as qty,
           -m.quantity * coalesce(m.unit_sale_price, 0) as revenue,
           -m.quantity * (coalesce(m.unit_sale_price, 0) - coalesce(m.unit_purchase_price, 0)) as margin,
           -m.quantity * coalesce(m.unit_purchase_price, 0) as cost
    from public.tire_movements m
    where m.reason = 'sale' and m.created_at >= now() - interval '60 days'
  )
  select jsonb_build_object(
    'stock_qty', (select coalesce(sum(stock_qty), 0) from public.v_tire_lines),
    'sizes', (select count(*) from public.v_tire_lines where stock_qty > 0),
    'lots', (select coalesce(sum(lots_count), 0) from public.v_tire_lines),
    'to_order', (select count(*) from public.v_tire_lines where status = 'to_order'),
    'out', (select count(*) from public.v_tire_lines where status = 'out'),
    'sold_30d', (select coalesce(sum(qty), 0) from sales where is_current),
    'sold_prev_30d', (select coalesce(sum(qty), 0) from sales where not is_current),
    'revenue_30d', (select coalesce(sum(revenue), 0) from sales where is_current),
    'margin_30d', (select coalesce(sum(margin), 0) from sales where is_current),
    'margin_percent', (select round(sum(margin) / nullif(sum(cost), 0) * 100, 1) from sales where is_current)
  );
$$;

-- ---------------------------------------------------------------------------
-- Stock mini : alerte de la direction et de la réception
-- ---------------------------------------------------------------------------

create function public.tire_line_alert(p_line_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_label text;
begin
  select * into v_line from public.v_tire_lines where id = p_line_id;
  if not found or v_line.status = 'ok' then
    return;
  end if;
  v_label := v_line.size || case v_line.profile when 'avant' then ' avant' when 'arriere' then ' arrière'
                                                 when 'remorque' then ' remorque' else '' end;
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select role, 'low_stock',
         case when v_line.status = 'out' then 'Rupture de pneus : ' else 'Pneus à commander : ' end || v_label,
         'Disponible ' || v_line.available_qty || ' (seuil ' || v_line.min_qty || ') : il manque '
           || v_line.missing_qty || ' pneu' || case when v_line.missing_qty > 1 then 's' else '' end,
         '/stock/pneumatiques?filtre=seuil',
         'tire-' || p_line_id || '-' || role || '-' || public.paris_date(now())
  from unnest(array['direction', 'reception']::public.app_role[]) as role
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke execute on function public.tire_line_alert(uuid) from public, anon, authenticated;

create function public.tire_movements_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line uuid;
begin
  update public.tires set stock_qty = stock_qty + new.quantity where id = new.tire_id returning line_id into v_line;
  if new.quantity < 0 then
    perform public.tire_line_alert(v_line);
  end if;
  return null;
end;
$$;
revoke execute on function public.tire_movements_apply() from public, anon, authenticated;

create trigger tire_movements_apply
  after insert on public.tire_movements
  for each row execute function public.tire_movements_apply();

create function public.tire_lines_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tire_line_alert(new.id);
  return null;
end;
$$;
revoke execute on function public.tire_lines_alert() from public, anon, authenticated;

create trigger tire_lines_alert
  after update of min_qty on public.tire_lines
  for each row when (new.min_qty > old.min_qty)
  execute function public.tire_lines_alert();

-- Pneu mis au devis : le disponible baisse
create function public.quote_lines_tire_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tire_line_alert(t.line_id) from public.tires t where t.part_id = new.part_id;
  return null;
end;
$$;
revoke execute on function public.quote_lines_tire_alert() from public, anon, authenticated;

create trigger quote_lines_tire_alert
  after insert or update of part_id, quantity on public.quote_lines
  for each row when (new.part_id is not null)
  execute function public.quote_lines_tire_alert();

-- ---------------------------------------------------------------------------
-- Facture émise : les pneus facturés sortent du stock
-- ---------------------------------------------------------------------------

create function public.invoices_tire_sales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tire_movements (tire_id, quantity, reason, unit_purchase_price, unit_sale_price,
                                     repair_order_id, invoice_id, note, created_by)
  select t.id, -round(sum(il.quantity))::integer, 'sale',
         coalesce(max(il.purchase_price), t.purchase_price),
         round(sum(il.net_ht) / nullif(sum(il.quantity), 0), 2),
         (array_agg(il.repair_order_id) filter (where il.repair_order_id is not null))[1],
         new.id, 'Facture ' || new.number, new.issued_by
  from public.invoice_lines il
  join public.tires t on t.part_id = il.part_id
  where il.invoice_id = new.id
  group by t.id, t.purchase_price
  having round(sum(il.quantity)) > 0
  on conflict do nothing;
  return null;
end;
$$;
revoke execute on function public.invoices_tire_sales() from public, anon, authenticated;

create trigger invoices_tire_sales
  after update of status on public.invoices
  for each row when (new.status = 'issued' and old.status = 'draft')
  execute function public.invoices_tire_sales();

-- ---------------------------------------------------------------------------
-- Entrée en stock, entrée d'un lot existant, correction
-- ---------------------------------------------------------------------------

-- Ajout au stock : ligne (taille, profil) et marque créées au besoin ; même marque, modèle et état
-- qu'un lot de la ligne : sa quantité et ses prix sont mis à jour.
create function public.add_tires(
  p_category public.tire_category,
  p_size text,
  p_profile public.tire_profile,
  p_brand text,
  p_model text,
  p_condition public.tire_condition,
  p_quantity integer,
  p_purchase_price numeric,
  p_sale_price numeric,
  p_supplier_id uuid default null,
  p_load_index text default null,
  p_location text default null,
  p_dot text default null,
  p_min_qty integer default null,
  p_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_size text := public.tire_size_label(p_size);
  v_line uuid;
  v_brand uuid;
  v_tire uuid;
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  if v_size is null then
    raise exception 'Dimension invalide : tape par exemple 31580225' using errcode = '22023';
  end if;
  if (p_category = 'vul') <> (p_profile = 'toutes') then
    raise exception 'Profil invalide pour cette catégorie' using errcode = '22023';
  end if;
  if public.normalize_key(coalesce(p_brand, '')) = '' then
    raise exception 'Indique la marque' using errcode = '22023';
  end if;
  if coalesce(p_quantity, -1) < 0 then
    raise exception 'Quantité invalide' using errcode = '22023';
  end if;

  insert into public.tire_lines (category, size, profile, min_qty)
  values (p_category, v_size, p_profile, coalesce(p_min_qty, 0))
  on conflict (category, size_key, profile) do update
    set min_qty = coalesce(p_min_qty, public.tire_lines.min_qty)
  returning id into v_line;

  insert into public.tire_brands (name) values (btrim(p_brand))
  on conflict (name_key) do update set name = public.tire_brands.name
  returning id into v_brand;

  select id into v_tire from public.tires
  where line_id = v_line and brand_id = v_brand and lower(btrim(model)) = lower(btrim(coalesce(p_model, '')))
    and condition = p_condition and is_active
  for update;

  if v_tire is null then
    insert into public.tires (line_id, brand_id, model, condition, load_index, location, dot, supplier_id,
                              purchase_price, sale_price)
    values (v_line, v_brand, btrim(coalesce(p_model, '')), p_condition, nullif(btrim(p_load_index), ''),
            nullif(btrim(p_location), ''), nullif(btrim(p_dot), ''), p_supplier_id, p_purchase_price,
            p_sale_price)
    returning id into v_tire;
  else
    update public.tires
       set purchase_price = coalesce(p_purchase_price, purchase_price),
           sale_price = coalesce(p_sale_price, sale_price),
           supplier_id = coalesce(p_supplier_id, supplier_id),
           load_index = coalesce(nullif(btrim(p_load_index), ''), load_index),
           location = coalesce(nullif(btrim(p_location), ''), location),
           dot = coalesce(nullif(btrim(p_dot), ''), dot)
     where id = v_tire;
  end if;

  if p_quantity > 0 then
    insert into public.tire_movements (tire_id, quantity, reason, supplier_id, reference, unit_purchase_price,
                                       note, created_by)
    values (v_tire, p_quantity, 'entry', p_supplier_id, nullif(btrim(p_reference), ''), p_purchase_price,
            case when p_supplier_id is null then 'Entrée en stock' end, auth.uid());
  end if;
  return v_tire;
end;
$$;

-- Arrivage d'un lot existant : quantité reçue, prix d'achat du pneu, fournisseur, bon de livraison
create function public.receive_tires(
  p_tire_id uuid,
  p_quantity integer,
  p_purchase_price numeric default null,
  p_supplier_id uuid default null,
  p_reference text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qty integer;
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'Indique la quantité reçue' using errcode = '22023';
  end if;
  update public.tires
     set purchase_price = coalesce(p_purchase_price, purchase_price),
         supplier_id = coalesce(p_supplier_id, supplier_id)
   where id = p_tire_id and is_active;
  if not found then
    raise exception 'Pneu introuvable' using errcode = 'P0002';
  end if;
  insert into public.tire_movements (tire_id, quantity, reason, supplier_id, reference, unit_purchase_price,
                                     created_by)
  select p_tire_id, p_quantity, 'entry', coalesce(p_supplier_id, t.supplier_id), nullif(btrim(p_reference), ''),
         t.purchase_price, auth.uid()
  from public.tires t where t.id = p_tire_id;
  select stock_qty into v_qty from public.tires where id = p_tire_id;
  return v_qty;
end;
$$;

-- Sortie ou inventaire : stock compté, motif obligatoire
create function public.correct_tire_stock(p_tire_id uuid, p_counted integer, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'Indique le motif de la correction' using errcode = '22023';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'Stock invalide' using errcode = '22023';
  end if;
  select stock_qty into v_current from public.tires where id = p_tire_id for update;
  if not found then
    raise exception 'Pneu introuvable' using errcode = 'P0002';
  end if;
  if p_counted <> v_current then
    insert into public.tire_movements (tire_id, quantity, reason, note, created_by)
    values (p_tire_id, p_counted - v_current, 'correction', btrim(p_note), auth.uid());
  end if;
  return p_counted;
end;
$$;

revoke execute on function
  public.add_tires(public.tire_category, text, public.tire_profile, text, text, public.tire_condition, integer,
                   numeric, numeric, uuid, text, text, text, integer, text),
  public.receive_tires(uuid, integer, numeric, uuid, text),
  public.correct_tire_stock(uuid, integer, text),
  public.tire_stock_kpis(),
  public.tire_size_label(text),
  public.tire_size_key(text)
from public, anon;
grant execute on function
  public.add_tires(public.tire_category, text, public.tire_profile, text, text, public.tire_condition, integer,
                   numeric, numeric, uuid, text, text, text, integer, text),
  public.receive_tires(uuid, integer, numeric, uuid, text),
  public.correct_tire_stock(uuid, integer, text),
  public.tire_stock_kpis(),
  public.tire_size_label(text),
  public.tire_size_key(text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Pièces : les pneus restent dans leur module
-- ---------------------------------------------------------------------------

-- Pièce saisie sur un devis ou une facture : jamais reprise sur la pièce d'un lot de pneus
create or replace function public.find_catalog_part(p_designation text, p_manufacturer_ref text, p_brand text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.parts
  where lower(btrim(designation)) = lower(btrim(coalesce(p_designation, '')))
    and lower(btrim(coalesce(manufacturer_ref, ''))) = lower(btrim(coalesce(p_manufacturer_ref, '')))
    and lower(btrim(coalesce(brand, ''))) = lower(btrim(coalesce(p_brand, '')))
    and not is_tire
  order by is_active desc, updated_at desc
  limit 1;
$$;

create or replace view public.v_part_stats
with (security_invoker = on) as
select
  p.id,
  p.designation,
  p.vehicle_ref,
  p.manufacturer_ref,
  p.brand,
  p.oem_ref,
  p.supplier_id,
  sp.name as supplier_name,
  p.purchase_price,
  p.shipping_cost,
  p.margin_kind,
  p.margin_value,
  p.sale_price,
  coalesce(s.invoices_count, 0) as invoices_count,
  coalesce(q.quotes_count, 0) as quotes_count,
  coalesce(s.quantity_sold, 0) as quantity_sold,
  coalesce(s.revenue_ht, 0) as revenue_ht,
  coalesce(s.margin_ht, 0) as margin_ht,
  s.last_sold_at
from public.parts p
left join public.suppliers sp on sp.id = p.supplier_id
left join lateral (
  select count(distinct il.invoice_id) as invoices_count,
         sum(il.quantity) as quantity_sold,
         sum(il.net_ht) as revenue_ht,
         sum(il.net_ht - coalesce(il.purchase_price, 0) * il.quantity - coalesce(il.shipping_cost, 0)) as margin_ht,
         max(i.issued_at) as last_sold_at
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  where il.part_id = p.id and i.status = 'issued'
) s on true
left join lateral (
  select count(distinct ql.quote_id) as quotes_count from public.quote_lines ql where ql.part_id = p.id
) q on true
where p.is_active and not p.is_tire;

-- ---------------------------------------------------------------------------
-- Accès : le bureau gère le stock, la direction seule supprime
-- ---------------------------------------------------------------------------

alter table public.tire_brands enable row level security;
alter table public.tire_lines enable row level security;
alter table public.tires enable row level security;
alter table public.tire_movements enable row level security;
revoke all on public.tire_brands, public.tire_lines, public.tires, public.tire_movements from anon;

create policy tire_brands_select on public.tire_brands for select to authenticated using (public.is_office());
create policy tire_brands_insert on public.tire_brands for insert to authenticated with check (public.is_office());
create policy tire_brands_update on public.tire_brands for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy tire_brands_delete on public.tire_brands for delete to authenticated using (public.is_direction());

create policy tire_lines_select on public.tire_lines for select to authenticated using (public.is_office());
create policy tire_lines_insert on public.tire_lines for insert to authenticated with check (public.is_office());
create policy tire_lines_update on public.tire_lines for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy tire_lines_delete on public.tire_lines for delete to authenticated using (public.is_direction());

create policy tires_select on public.tires for select to authenticated using (public.is_office());
create policy tires_update on public.tires for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy tires_delete on public.tires for delete to authenticated using (public.is_direction());

create policy tire_movements_select on public.tire_movements for select to authenticated using (public.is_office());

-- Stock et pièce du lot : seulement par les mouvements et le déclencheur
revoke insert on public.tires, public.tire_movements from authenticated;
revoke update on public.tires from authenticated;
grant update (line_id, brand_id, model, condition, load_index, location, dot, supplier_id, purchase_price,
               sale_price, is_active) on public.tires to authenticated;
revoke update, delete on public.tire_movements from authenticated;
