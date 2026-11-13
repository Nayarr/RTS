-- SAV : OR de reprise après un OR (ou sa facture), gratuit pour le client, compté contre celui qui l'a causé.
--   - repair_orders.sav_of_repair_order_id : OR d'origine ; sav_responsible_technician_id : technicien
--     responsable (par défaut celui de l'OR d'origine, au choix du bureau).
--   - Devis et facture d'un OR de SAV : toutes les lignes à 100 % de remise (main d'œuvre, pièces,
--     fournitures et recyclage), facture à 0 € avec la mention du SAV. Le prix d'achat des pièces reste
--     sur les lignes : la marge des pièces sort en négatif dans les statistiques (-50 € pour une pièce
--     achetée 50 €).
--   - Performance : le temps badgé sur un OR de SAV ne compte plus pour celui qui le fait, il compte
--     pour le responsable (« SAV causés » : nombre, heures, coût = heures × taux horaire + pièces).

alter table public.repair_orders
  add column sav_of_repair_order_id uuid references public.repair_orders (id) on delete set null,
  add column sav_responsible_technician_id uuid references public.technicians (id) on delete set null,
  add constraint repair_orders_sav_responsible_check
    check (sav_responsible_technician_id is null or sav_of_repair_order_id is not null),
  add constraint repair_orders_sav_not_self_check check (sav_of_repair_order_id <> id);
comment on column public.repair_orders.sav_of_repair_order_id is
  'OR de SAV : OR d''origine repris gratuitement pour le client.';
comment on column public.repair_orders.sav_responsible_technician_id is
  'OR de SAV : technicien qui a causé le SAV (son temps et ses pièces comptent contre lui en performance).';
create index repair_orders_sav_idx on public.repair_orders (sav_of_repair_order_id)
  where sav_of_repair_order_id is not null;

create function public.is_sav_repair_order(p_repair_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.repair_orders
                 where id = p_repair_order_id and sav_of_repair_order_id is not null);
$$;
revoke execute on function public.is_sav_repair_order(uuid) from public, anon;
grant execute on function public.is_sav_repair_order(uuid) to authenticated;

-- Facture dont tous les OR sont des SAV (ligne sans OR : fournitures et recyclage, lignes ajoutées)
create function public.invoice_is_sav(p_invoice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.invoice_repair_orders where invoice_id = p_invoice_id)
     and not exists (select 1 from public.invoice_repair_orders iro
                     join public.repair_orders r on r.id = iro.repair_order_id
                     where iro.invoice_id = p_invoice_id and r.sav_of_repair_order_id is null);
$$;
revoke execute on function public.invoice_is_sav(uuid) from public, anon;
grant execute on function public.invoice_is_sav(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Marquer un OR comme SAV d'un autre (même véhicule), choisir le responsable
-- ---------------------------------------------------------------------------
create function public.mark_repair_order_sav(p_repair_order_id uuid, p_origin_repair_order_id uuid,
                                             p_responsible_technician_id uuid default null)
returns public.repair_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_origin public.repair_orders;
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id for update;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;
  -- OR facturé : seule la direction change encore le responsable (performance, pas la facture)
  if v_ro.status = 'invoiced' and not (public.is_direction()
       and v_ro.sav_of_repair_order_id is not distinct from p_origin_repair_order_id) then
    raise exception 'OR facturé : il ne peut plus devenir un SAV' using errcode = '42501';
  end if;
  select * into v_origin from public.repair_orders where id = p_origin_repair_order_id;
  if not found then
    raise exception 'OR d''origine introuvable' using errcode = 'P0002';
  end if;
  if v_origin.id = v_ro.id then
    raise exception 'Un OR ne peut pas être le SAV de lui-même' using errcode = '22023';
  end if;
  if v_origin.vehicle_id <> v_ro.vehicle_id then
    raise exception 'Le SAV doit concerner le même véhicule que l''OR d''origine' using errcode = '22023';
  end if;
  if p_responsible_technician_id is not null
     and not exists (select 1 from public.technicians where id = p_responsible_technician_id) then
    raise exception 'Technicien introuvable' using errcode = 'P0002';
  end if;

  perform set_config('rts.system', case when v_ro.status = 'invoiced' then 'on' else '' end, true);
  update public.repair_orders
     set sav_of_repair_order_id = v_origin.id,
         sav_responsible_technician_id = coalesce(p_responsible_technician_id, v_origin.technician_id)
   where id = v_ro.id
  returning * into v_ro;
  perform set_config('rts.system', '', true);

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_ro.id, 'SAV de ' || v_origin.number || coalesce(' · responsable : '
            || (select display_name from public.technicians where id = v_ro.sav_responsible_technician_id), ''),
          auth.uid());
  return v_ro;
end;
$$;
revoke execute on function public.mark_repair_order_sav(uuid, uuid, uuid) from public, anon;
grant execute on function public.mark_repair_order_sav(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Gratuité : lignes de devis et de facture d'un SAV à 100 % de remise
-- ---------------------------------------------------------------------------
create function public.invoice_lines_sav_free()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.line_type <> 'text'
     and ((new.repair_order_id is not null and public.is_sav_repair_order(new.repair_order_id))
          or (new.repair_order_id is null and public.invoice_is_sav(new.invoice_id))) then
    new.discount_percent := 100;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoice_lines_sav_free() from public, anon, authenticated;
create trigger invoice_lines_sav_free
  before insert or update of discount_percent, repair_order_id, line_type on public.invoice_lines
  for each row execute function public.invoice_lines_sav_free();

create function public.quote_lines_sav_free()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.line_type <> 'text' and exists (
       select 1 from public.quotes q
       where q.id = new.quote_id and public.is_sav_repair_order(q.repair_order_id)) then
    new.discount_percent := 100;
  end if;
  return new;
end;
$$;
revoke execute on function public.quote_lines_sav_free() from public, anon, authenticated;
create trigger quote_lines_sav_free
  before insert or update of discount_percent, line_type on public.quote_lines
  for each row execute function public.quote_lines_sav_free();

-- OR de SAV rattaché à une facture : lignes déjà posées (fournitures et recyclage) gratuites, mention du SAV
create function public.invoice_repair_orders_sav()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin_number text;
begin
  select o.number into v_origin_number
  from public.repair_orders r join public.repair_orders o on o.id = r.sav_of_repair_order_id
  where r.id = new.repair_order_id;
  if v_origin_number is null then
    return null;
  end if;

  update public.invoice_lines
     set discount_percent = 100
   where invoice_id = new.invoice_id and line_type <> 'text' and discount_percent <> 100
     and (repair_order_id = new.repair_order_id
          or (repair_order_id is null and public.invoice_is_sav(new.invoice_id)));

  insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description)
  values (new.invoice_id, new.repair_order_id, 1, 'text',
          'SAV de l''OR ' || v_origin_number || ' : intervention prise en charge par l''atelier, non facturée.');
  return null;
end;
$$;
revoke execute on function public.invoice_repair_orders_sav() from public, anon, authenticated;
create trigger invoice_repair_orders_sav
  after insert on public.invoice_repair_orders
  for each row execute function public.invoice_repair_orders_sav();

-- ---------------------------------------------------------------------------
-- Vue des OR : SAV, OR d'origine et responsable
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_def text := pg_get_viewdef('public.v_repair_orders_overview'::regclass);
  v_new text := regexp_replace(v_def, E'\n   FROM (\\(*repair_orders r)',
    E',\n    r.sav_of_repair_order_id,'
    || E'\n    ( SELECT o.number FROM repair_orders o WHERE o.id = r.sav_of_repair_order_id) AS sav_of_number,'
    || E'\n    r.sav_responsible_technician_id,'
    || E'\n    ( SELECT st.display_name FROM technicians st WHERE st.id = r.sav_responsible_technician_id)'
    || E' AS sav_responsible_name\n   FROM \\1');
begin
  if v_new = v_def then
    raise exception 'v_repair_orders_overview : clause FROM introuvable';
  end if;
  execute 'create or replace view public.v_repair_orders_overview with (security_invoker = on) as ' || v_new;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Performance : SAV comptés contre le responsable, pas contre celui qui les fait
-- ---------------------------------------------------------------------------
drop function public.technician_performance(date, date);

create function public.technician_performance(p_from date default null, p_to date default null)
returns table (
  technician_id               uuid,
  name                        text,
  color                       text,
  labor_ht                    numeric,
  sales_margin_ht             numeric,
  ro_count                    bigint,
  billed_hours                numeric,
  worked_hours                numeric,
  presence_hours              numeric,
  estimate_deviation_percent  numeric,
  average_lead_days           numeric,
  sav_count                   bigint,
  sav_hours                   numeric,
  sav_cost_ht                 numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamp at time zone 'Europe/Paris';
  v_to timestamptz := p_to::timestamp at time zone 'Europe/Paris';
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;

  return query
  with issued as (
    select il.id, il.line_type, i.issued_at,
           coalesce(il.repair_order_id, (
             select min(iro.repair_order_id::text)::uuid from public.invoice_repair_orders iro
             where iro.invoice_id = i.id
             having count(*) = 1
           )) as repair_order_id,
           (il.net_ht - case when i.vat_scheme = 'margin' then i.total_vat else 0 end) as net_ht,
           il.purchase_price, il.quantity, il.shipping_cost,
           coalesce(il.billed_hours, il.standard_hours, 0) as hours
    from public.invoice_lines il
    join public.invoices i on i.id = il.invoice_id
    where i.status = 'issued' and il.line_type <> 'text'
      and (v_from is null or i.issued_at >= v_from)
      and (v_to is null or i.issued_at < v_to)
  ),
  attributed as (
    select coalesce(e.technician_id,
                    (select t.id from public.technicians t where t.profile_id = e.profile_id limit 1),
                    case when e.invoice_line_id is null then ro.technician_id end) as technician_id,
           l.repair_order_id,
           case when l.line_type in ('labor', 'package', 'travel') then l.net_ht else 0 end as labor_ht,
           case when l.line_type in ('labor', 'package', 'travel') then l.hours else 0 end as billed_hours,
           case when l.line_type in ('part', 'consumable', 'subcontract')
                then l.net_ht - coalesce(l.purchase_price, 0)
                       * case when l.line_type = 'subcontract' then 1 else l.quantity end
                     - coalesce(l.shipping_cost, 0)
                else 0 end as sales_margin_ht
    from issued l
    left join public.invoice_line_employees e on e.invoice_line_id = l.id
    left join public.repair_orders ro on ro.id = l.repair_order_id
    -- Facture d'un SAV (0 €) : comptée dans « SAV causés » du responsable, pas ligne par ligne
    where ro.sav_of_repair_order_id is null
  ),
  per_tech as (
    select a.technician_id, sum(a.labor_ht) as labor_ht, sum(a.sales_margin_ht) as sales_margin_ht,
           sum(a.billed_hours) as billed_hours,
           count(distinct a.repair_order_id) as ro_count
    from attributed a
    where a.technician_id is not null
    group by a.technician_id
  ),
  per_ro as (
    select l.repair_order_id, min(l.issued_at) as invoiced_at
    from issued l
    where l.repair_order_id is not null
    group by l.repair_order_id
  ),
  ro_facts as (
    select ro.technician_id,
           extract(epoch from (p.invoiced_at - ro.created_at)) / 86400 as lead_days,
           (select sum(l.estimated_hours) from public.ro_lines l
            where l.repair_order_id = ro.id and l.kind = 'planned' and l.line_type = 'labor') as estimated,
           (select sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at))) / 3600
            from public.time_entries t where t.repair_order_id = ro.id) as worked
    from per_ro p
    join public.repair_orders ro on ro.id = p.repair_order_id
    where ro.technician_id is not null and ro.sav_of_repair_order_id is null
  ),
  facts as (
    select f.technician_id,
           round(avg(abs(f.estimated - f.worked) / f.worked * 100)
                 filter (where f.estimated > 0 and f.worked > 0), 1) as deviation,
           round(avg(f.lead_days), 1) as lead_days
    from ro_facts f
    group by f.technician_id
  ),
  period_entries as (
    select t.technician_id, t.repair_order_id, r.sav_responsible_technician_id, r.client_id, r.vehicle_type,
           extract(epoch from (coalesce(t.ended_at, now()) - t.started_at)) / 3600 as hours,
           r.sav_of_repair_order_id is not null as is_sav
    from public.time_entries t
    left join public.repair_orders r on r.id = t.repair_order_id
    where (v_from is null or t.started_at >= v_from)
      and (v_to is null or t.started_at < v_to)
  ),
  -- Temps badgé : sans le temps passé sur un SAV (le rattrapage ne pénalise pas celui qui le fait)
  badged as (
    select e.technician_id, sum(e.hours) as hours
    from period_entries e
    where e.technician_id is not null and not e.is_sav
    group by e.technician_id
  ),
  sav_time as (
    select e.sav_responsible_technician_id as technician_id, sum(e.hours) as hours,
           sum(e.hours * public.labor_rate_for(e.client_id, e.vehicle_type)) as cost
    from period_entries e
    where e.is_sav and e.sav_responsible_technician_id is not null
    group by e.sav_responsible_technician_id
  ),
  -- SAV ouverts sur la période : nombre et coût d'achat des pièces et de la sous-traitance
  sav_orders as (
    select r.sav_responsible_technician_id as technician_id, count(*) as orders,
           sum((select coalesce(sum(coalesce(l.purchase_price, 0) * l.quantity + coalesce(l.shipping_cost, 0)), 0)
                from public.ro_lines l where l.repair_order_id = r.id and l.line_type = 'part')
               + (select coalesce(sum(s.cost_ht), 0) from public.subcontracts s where s.repair_order_id = r.id))
             as parts_cost
    from public.repair_orders r
    where r.sav_of_repair_order_id is not null and r.sav_responsible_technician_id is not null
      and (v_from is null or r.created_at >= v_from)
      and (v_to is null or r.created_at < v_to)
    group by r.sav_responsible_technician_id
  ),
  presence as (
    select a.technician_id, sum(a.worked_seconds) / 3600.0 as hours
    from public.v_daily_attendance a
    where (p_from is null or a.work_date >= p_from) and (p_to is null or a.work_date < p_to)
    group by a.technician_id
  )
  select
    tech.id,
    tech.display_name,
    tech.color,
    coalesce(pt.labor_ht, 0),
    round(coalesce(pt.sales_margin_ht, 0), 2),
    coalesce(pt.ro_count, 0),
    coalesce(pt.billed_hours, 0),
    round(coalesce(b.hours, 0), 2),
    round(pr.hours, 2),
    fa.deviation,
    fa.lead_days,
    coalesce(so.orders, 0),
    round(coalesce(st.hours, 0), 2),
    round(coalesce(st.cost, 0) + coalesce(so.parts_cost, 0), 2)
  from public.technicians tech
  left join per_tech pt on pt.technician_id = tech.id
  left join facts fa on fa.technician_id = tech.id
  left join badged b on b.technician_id = tech.id
  left join sav_time st on st.technician_id = tech.id
  left join sav_orders so on so.technician_id = tech.id
  left join presence pr on pr.technician_id = tech.id
  where tech.is_active
  order by tech.sort_order, tech.display_name;
end;
$$;

revoke execute on function public.technician_performance(date, date) from public, anon;
grant execute on function public.technician_performance(date, date) to authenticated;
