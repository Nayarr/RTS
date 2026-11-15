-- Performance : chaque ligne de facture compte pour le salarié indiqué sur la ligne (« qui a fait quoi »),
-- plus seulement pour le technicien de l'OR.
--   Main d'œuvre, forfaits, déplacement : CA MO et heures facturées du salarié de la ligne.
--   Pièces, fournitures et recyclage, sous-traitance : marge de la vente (prix de vente − prix d'achat
--   − port) dans « ventes » du salarié qui l'a vendue ; la ligne « Fournitures et recyclage », sans prix
--   d'achat, compte en entier (+15 €).
--   Salarié du bureau (compte sans fiche technicien) : pas dans la liste des techniciens ; un compte du
--   bureau qui badge a sa fiche et y figure.
--   Ligne sans salarié : technicien de l'OR, comme avant.
-- Précision d'estimation et délai restent calculés par OR, pour le technicien de l'OR.

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
  average_lead_days           numeric
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
    -- Lignes des factures émises sur la période, rattachées à leur OR (ou à l'OR unique de la facture)
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
    where ro.technician_id is not null
  ),
  facts as (
    select f.technician_id,
           round(avg(abs(f.estimated - f.worked) / f.worked * 100)
                 filter (where f.estimated > 0 and f.worked > 0), 1) as deviation,
           round(avg(f.lead_days), 1) as lead_days
    from ro_facts f
    group by f.technician_id
  ),
  badged as (
    select t.technician_id,
           sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at))) / 3600 as hours
    from public.time_entries t
    where t.technician_id is not null
      and (v_from is null or t.started_at >= v_from)
      and (v_to is null or t.started_at < v_to)
    group by t.technician_id
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
    fa.lead_days
  from public.technicians tech
  left join per_tech pt on pt.technician_id = tech.id
  left join facts fa on fa.technician_id = tech.id
  left join badged b on b.technician_id = tech.id
  left join presence pr on pr.technician_id = tech.id
  where tech.is_active
  order by tech.sort_order, tech.display_name;
end;
$$;

revoke execute on function public.technician_performance(date, date) from public, anon;
grant execute on function public.technician_performance(date, date) to authenticated;
