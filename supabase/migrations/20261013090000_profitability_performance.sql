-- =============================================================================
-- RTS Atelier — Pilotage : rentabilité et performance des techniciens (direction)
--   Période [p_from, p_to[ en jours de Paris (null = sans limite), appliquée à la
--   date d'émission des factures.
--   Une ligne de facture sans OR est rattachée à l'OR de la facture quand celle-ci
--   n'en facture qu'un seul.
-- =============================================================================

-- Lignes facturées de la période, rattachées à leur OR.
create or replace function public.invoiced_ro_lines(p_from date, p_to date)
returns table (
  repair_order_id  uuid,
  issued_at        timestamptz,
  labor_ht         numeric,
  parts_ht         numeric,
  parts_margin_ht  numeric,
  billed_hours     numeric
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(e.repair_order_id, (
      select min(iro.repair_order_id::text)::uuid from public.invoice_repair_orders iro
      where iro.invoice_id = e.invoice_id
      having count(*) = 1
    )),
    e.issued_at,
    e.labor_ht,
    e.parts_ht,
    e.parts_margin_ht,
    e.billed_hours
  from public.v_invoice_line_economics e
  where (p_from is null or e.issued_at >= (p_from::timestamp at time zone 'Europe/Paris'))
    and (p_to is null or e.issued_at < (p_to::timestamp at time zone 'Europe/Paris'));
$$;

revoke execute on function public.invoiced_ro_lines(date, date) from public, anon;
grant execute on function public.invoiced_ro_lines(date, date) to authenticated;

-- Rentabilité par client et véhicule : CA, marge pièces, heures facturées / badgées, impayés.
create or replace function public.profitability_report(p_from date default null, p_to date default null)
returns table (
  client_id          uuid,
  client_name        text,
  vehicle_id         uuid,
  plate              text,
  ro_count           bigint,
  labor_ht           numeric,
  parts_ht           numeric,
  parts_margin_ht    numeric,
  billed_hours       numeric,
  worked_hours       numeric,
  client_unpaid_ttc  numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;

  return query
  with per_ro as (
    select l.repair_order_id,
           sum(l.labor_ht) as labor_ht, sum(l.parts_ht) as parts_ht,
           sum(l.parts_margin_ht) as parts_margin_ht, sum(l.billed_hours) as billed_hours
    from public.invoiced_ro_lines(p_from, p_to) l
    where l.repair_order_id is not null
    group by l.repair_order_id
  ),
  worked as (
    select t.repair_order_id,
           sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at))) / 3600 as hours
    from public.time_entries t
    where t.repair_order_id in (select repair_order_id from per_ro)
    group by t.repair_order_id
  ),
  unpaid as (
    select b.client_id, sum(b.balance_due) as amount
    from public.v_invoice_balances b
    where b.balance_due > 0.01
    group by b.client_id
  )
  select
    ro.client_id,
    coalesce(c.name, '—'),
    ro.vehicle_id,
    v.plate,
    count(*),
    sum(p.labor_ht),
    sum(p.parts_ht),
    sum(p.parts_margin_ht),
    sum(p.billed_hours),
    round(coalesce(sum(w.hours), 0), 2),
    coalesce(max(u.amount), 0)
  from per_ro p
  join public.repair_orders ro on ro.id = p.repair_order_id
  join public.vehicles v on v.id = ro.vehicle_id
  left join public.clients c on c.id = ro.client_id
  left join worked w on w.repair_order_id = p.repair_order_id
  left join unpaid u on u.client_id = ro.client_id
  group by ro.client_id, c.name, ro.vehicle_id, v.plate
  order by sum(p.labor_ht + p.parts_ht) desc, v.plate;
end;
$$;

revoke execute on function public.profitability_report(date, date) from public, anon;
grant execute on function public.profitability_report(date, date) to authenticated;

-- Performance des techniciens actifs.
--   CA MO, heures facturées, précision d'estimation et délai : OR du technicien facturés sur la période.
--   Heures badgées (sur les OR) et heures de présence (pointage) : sur la période.
create or replace function public.technician_performance(p_from date default null, p_to date default null)
returns table (
  technician_id               uuid,
  name                        text,
  color                       text,
  labor_ht                    numeric,
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
  with per_ro as (
    select l.repair_order_id, sum(l.labor_ht) as labor_ht, sum(l.billed_hours) as billed_hours,
           min(l.issued_at) as invoiced_at
    from public.invoiced_ro_lines(p_from, p_to) l
    where l.repair_order_id is not null
    group by l.repair_order_id
  ),
  ro_facts as (
    select ro.technician_id, p.repair_order_id, p.labor_ht, p.billed_hours,
           extract(epoch from (p.invoiced_at - ro.created_at)) / 86400 as lead_days,
           (select sum(l.estimated_hours) from public.ro_lines l
            where l.repair_order_id = ro.id and l.kind = 'planned' and l.line_type = 'labor') as estimated,
           (select sum(extract(epoch from (coalesce(t.ended_at, now()) - t.started_at))) / 3600
            from public.time_entries t where t.repair_order_id = ro.id) as worked
    from per_ro p
    join public.repair_orders ro on ro.id = p.repair_order_id
    where ro.technician_id is not null
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
    coalesce(sum(f.labor_ht), 0),
    count(f.repair_order_id),
    coalesce(sum(f.billed_hours), 0),
    round(coalesce(max(b.hours), 0), 2),
    round(max(pr.hours), 2),
    round(avg(abs(f.estimated - f.worked) / f.worked * 100) filter (where f.estimated > 0 and f.worked > 0), 1),
    round(avg(f.lead_days), 1)
  from public.technicians tech
  left join ro_facts f on f.technician_id = tech.id
  left join badged b on b.technician_id = tech.id
  left join presence pr on pr.technician_id = tech.id
  where tech.is_active
  group by tech.id, tech.display_name, tech.color, tech.sort_order
  order by tech.sort_order, tech.display_name;
end;
$$;

revoke execute on function public.technician_performance(date, date) from public, anon;
grant execute on function public.technician_performance(date, date) to authenticated;
