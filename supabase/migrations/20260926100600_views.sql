-- =============================================================================
-- RTS Atelier — 07. Vues de lecture
-- =============================================================================
-- Toutes les vues sont en security_invoker : elles appliquent les droits (RLS)
-- de l'utilisateur qui les interroge.
-- =============================================================================

-- Temps badgé par OR (sessions terminées + session en cours).
create view public.v_repair_order_time
with (security_invoker = on) as
select
  r.id as repair_order_id,
  coalesce(sum(extract(epoch from (coalesce(te.ended_at, now()) - te.started_at))), 0)::bigint as worked_seconds,
  max(te.started_at) filter (where te.ended_at is null) as running_since
from public.repair_orders r
left join public.time_entries te on te.repair_order_id = r.id
group by r.id;

-- Liste des OR enrichie (tableau de bord, liste technicien, planning, écran atelier).
create view public.v_repair_orders_overview
with (security_invoker = on) as
select
  r.*,
  v.plate,
  v.plate_key,
  c.name as client_name,
  t.display_name as technician_name,
  t.color as technician_color,
  tm.worked_seconds,
  tm.running_since,
  (select count(*) from public.ro_lines l
    where l.repair_order_id = r.id and l.line_type = 'part' and l.order_status <> 'received') as parts_pending_count,
  (select count(*) from public.ro_lines l
    where l.repair_order_id = r.id and l.line_type = 'part' and l.order_status = 'to_order') as parts_to_order_count,
  (select coalesce(array_agg(lbl), '{}') from unnest(public.required_photo_labels(r.vehicle_type)) as lbl
    where not exists (select 1 from public.ro_photos p where p.repair_order_id = r.id and p.label = lbl)) as missing_photo_labels,
  (select coalesce(sum(l.estimated_hours), 0) from public.ro_lines l
    where l.repair_order_id = r.id and l.kind = 'done') as declared_hours
from public.repair_orders r
join public.vehicles v on v.id = r.vehicle_id
left join public.clients c on c.id = r.client_id
left join public.technicians t on t.id = r.technician_id
left join public.v_repair_order_time tm on tm.repair_order_id = r.id;

-- Totaux d'un devis (TVA calculée par taux).
create view public.v_quote_totals
with (security_invoker = on) as
select
  q.id as quote_id,
  coalesce(s.total_ht, 0) as total_ht,
  coalesce(s.total_vat, 0) as total_vat,
  coalesce(s.total_ht, 0) + coalesce(s.total_vat, 0) as total_ttc
from public.quotes q
left join lateral (
  select sum(g.base) as total_ht, sum(round(g.base * g.vat_rate / 100, 2)) as total_vat
  from (
    select ql.vat_rate, sum(ql.net_ht) as base
    from public.quote_lines ql
    where ql.quote_id = q.id and ql.line_type <> 'text'
    group by ql.vat_rate
  ) g
) s on true;

-- Totaux d'une facture : figés si émise, calculés en direct si brouillon.
create view public.v_invoice_totals
with (security_invoker = on) as
select
  i.id as invoice_id,
  case when i.status = 'issued' then i.total_ht else coalesce(s.total_ht, 0) end as total_ht,
  case when i.status = 'issued' then i.total_vat else coalesce(s.total_vat, 0) end as total_vat,
  case when i.status = 'issued' then i.total_ttc else coalesce(s.total_ht, 0) + coalesce(s.total_vat, 0) end as total_ttc
from public.invoices i
left join lateral (
  select sum(g.base) as total_ht, sum(round(g.base * g.vat_rate / 100, 2)) as total_vat
  from (
    select il.vat_rate, sum(il.net_ht) as base
    from public.invoice_lines il
    where il.invoice_id = i.id and il.line_type <> 'text'
    group by il.vat_rate
  ) g
) s on true;

-- Solde et statut de paiement des factures émises.
--   paid = soldée, partial = partiellement payée, overdue = en retard, pending = en attente
create view public.v_invoice_balances
with (security_invoker = on) as
select
  i.id as invoice_id,
  i.number,
  i.client_id,
  i.client_name,
  i.vehicle_label,
  i.issued_at,
  i.due_date,
  i.total_ht,
  i.total_ttc,
  coalesce(p.paid, 0) as paid_ttc,
  coalesce(cn.credited, 0) as credited_ttc,
  greatest(i.total_ttc - coalesce(p.paid, 0) - coalesce(cn.credited, 0), 0) as balance_due,
  case
    when i.total_ttc - coalesce(p.paid, 0) - coalesce(cn.credited, 0) <= 0.01 then 'paid'
    when i.due_date < current_date then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'pending'
  end as payment_status,
  p.last_paid_on
from public.invoices i
left join lateral (
  select sum(amount_ttc) as paid, max(paid_on) as last_paid_on from public.payments where invoice_id = i.id
) p on true
left join lateral (
  select sum(total_ttc) as credited from public.credit_notes where invoice_id = i.id
) cn on true
where i.status = 'issued';

-- Détail économique des lignes facturées (statistiques, rentabilité, marge pièces).
create view public.v_invoice_line_economics
with (security_invoker = on) as
select
  il.invoice_id,
  i.number as invoice_number,
  i.issued_at,
  i.client_id,
  il.repair_order_id,
  il.line_type,
  il.net_ht,
  case when il.line_type in ('labor', 'package', 'travel') then il.net_ht else 0 end as labor_ht,
  case when il.line_type in ('part', 'consumable', 'subcontract') then il.net_ht else 0 end as parts_ht,
  case when il.line_type in ('part', 'consumable', 'subcontract')
       then il.net_ht - coalesce(il.purchase_price, 0) * case when il.line_type = 'subcontract' then 1 else il.quantity end
                      - coalesce(il.shipping_cost, 0)
       else 0 end as parts_margin_ht,
  coalesce(il.billed_hours, il.standard_hours, 0) as billed_hours
from public.invoice_lines il
join public.invoices i on i.id = il.invoice_id
where i.status = 'issued' and il.line_type <> 'text';

-- Chiffre d'affaires mensuel (écran Statistiques, rapport mensuel).
create view public.v_monthly_revenue
with (security_invoker = on) as
select
  date_trunc('month', e.issued_at at time zone 'Europe/Paris')::date as month,
  count(distinct e.invoice_id) as invoice_count,
  sum(e.labor_ht) as labor_ht,
  sum(e.parts_ht) as parts_ht,
  sum(e.parts_margin_ht) as parts_margin_ht,
  sum(e.net_ht) as total_ht
from public.v_invoice_line_economics e
group by 1;

-- Échéances véhicules (contrôle technique, hayon) dépassées ou dans les 30 jours.
create view public.v_vehicle_deadlines
with (security_invoker = on) as
select
  v.id as vehicle_id,
  v.plate,
  v.client_id,
  c.name as client_name,
  d.kind,
  d.due_date,
  d.due_date - current_date as days_left
from public.vehicles v
left join public.clients c on c.id = v.client_id
cross join lateral (
  values ('ct', v.ct_due_date), ('tailgate', v.tailgate_due_date)
) as d(kind, due_date)
where d.due_date is not null and d.due_date <= current_date + 30;

-- État de chaque véhicule sous contrat d'entretien (entretien à planifier ?).
create view public.v_contract_vehicle_status
with (security_invoker = on) as
select
  mc.id as contract_id,
  mc.client_id,
  mcv.vehicle_id,
  v.plate,
  last_ro.created_at as last_service_at,
  last_ro.mileage as last_service_mileage,
  latest.mileage as current_mileage,
  (latest.mileage - coalesce(last_ro.mileage, mcv.start_mileage)) as km_since_service,
  exists (
    select 1 from public.appointments a
    where a.maintenance_contract_id = mc.id and a.vehicle_id = mcv.vehicle_id and a.status = 'planned'
  ) as appointment_planned,
  (
    (mc.frequency_months is not null
      and coalesce(last_ro.created_at, mc.starts_on::timestamptz) + make_interval(months => mc.frequency_months) - interval '15 days' <= now())
    or (mc.frequency_km is not null and latest.mileage is not null
      and coalesce(last_ro.mileage, mcv.start_mileage) is not null
      and latest.mileage - coalesce(last_ro.mileage, mcv.start_mileage) >= mc.frequency_km * 0.9)
  ) as service_due
from public.maintenance_contracts mc
join public.maintenance_contract_vehicles mcv on mcv.contract_id = mc.id
join public.vehicles v on v.id = mcv.vehicle_id
left join lateral (
  select r.created_at, r.mileage from public.repair_orders r
  where r.vehicle_id = mcv.vehicle_id and r.maintenance_contract_id = mc.id
  order by r.created_at desc limit 1
) last_ro on true
left join lateral (
  select r.mileage from public.repair_orders r
  where r.vehicle_id = mcv.vehicle_id and r.mileage is not null
  order by r.created_at desc limit 1
) latest on true
where mc.is_active;

-- Présence journalière (pointages) : heures, anomalies, retard, heures supplémentaires.
-- Les arrivées / départs sont appariés dans l'ordre chronologique.
create view public.v_daily_attendance
with (security_invoker = on) as
with ordered as (
  select
    ce.technician_id,
    ce.work_date,
    ce.event_type,
    ce.occurred_at,
    lead(ce.event_type) over w as next_type,
    lead(ce.occurred_at) over w as next_at,
    lag(ce.event_type) over w as prev_type
  from public.clock_events ce
  window w as (partition by ce.technician_id, ce.work_date order by ce.occurred_at)
),
settings as (
  select overtime_start, late_tolerance, expected_arrival from public.app_settings
)
select
  o.technician_id,
  o.work_date,
  sum(case when o.event_type = 'in' and o.next_type = 'out'
           then extract(epoch from (o.next_at - o.occurred_at)) else 0 end)::bigint as worked_seconds,
  sum(case when o.event_type = 'in' and o.next_type = 'out'
           then greatest(0, extract(epoch from (
                  o.next_at - greatest(o.occurred_at, (o.work_date + s.overtime_start) at time zone 'Europe/Paris'))))
           else 0 end)::bigint as overtime_seconds,
  -- Oubli de badge : arrivée sans départ (hors journée en cours) ou départ sans arrivée.
  count(*) filter (where (o.event_type = 'in' and o.next_type is distinct from 'out' and o.work_date < public.paris_date(now()))
                      or (o.event_type = 'out' and o.prev_type is distinct from 'in')) as anomalies,
  -- Arrivée en cours (présent actuellement si la journée est aujourd'hui).
  bool_or(o.event_type = 'in' and o.next_type is null) as open_session,
  min(o.occurred_at) filter (where o.event_type = 'in') as first_in,
  -- Retard : première arrivée après la tolérance, compté depuis l'heure d'arrivée attendue.
  case
    when (min(o.occurred_at) filter (where o.event_type = 'in') at time zone 'Europe/Paris')::time > s.late_tolerance
    then (extract(epoch from ((min(o.occurred_at) filter (where o.event_type = 'in') at time zone 'Europe/Paris')::time
                              - s.expected_arrival)) / 60)::integer
    else 0
  end as late_minutes
from ordered o
cross join settings s
group by o.technician_id, o.work_date, s.overtime_start, s.late_tolerance, s.expected_arrival;
