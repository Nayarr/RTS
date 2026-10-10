-- =============================================================================
-- Charge de travail atelier : heures badgées et détail des heures
--
-- 1. Pour chaque technicien, la présence badgée à la borne sur la période (présence en cours
--    comprise) : le bureau, réception comprise, voit l'écart avec le temps déclaré (heures de
--    présence non affectées à un OR). Seul le total est donné, jamais les photos ni les heures.
-- 2. Détail des heures d'un technicien : d'où vient le temps déclaré (OR, travaux, jour) et les
--    OR planifiés sur la période.
-- =============================================================================

create or replace function public.workshop_workload(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings public.app_settings;
  v_today date := public.paris_date(now());
  v_technicians jsonb;
  v_to_plan jsonb;
begin
  perform public.assert_office();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  select * into v_settings from public.app_settings;

  with days as (
    select d::date as day, extract(isodow from d)::int as dow
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  techs as (
    select t.* from public.technicians t where t.is_active and not t.exclude_from_planning
  ),
  presence as (
    select t.id as technician_id, d.day, d.dow,
           -- Lundi de repos : un lundi sur deux, groupe A à partir du lundi de référence
           (d.dow = 1 and t.rest_group is not null and v_settings.rest_reference_monday is not null
             and t.rest_group = case when (((d.day - v_settings.rest_reference_monday) / 7) % 2 + 2) % 2 = 0
                                     then 'A'::public.rest_group else 'B'::public.rest_group end) as resting,
           exists (select 1 from public.leave_requests l
                   where l.technician_id = t.id and l.status = 'approved' and not l.is_deleted
                     and d.day between l.starts_on and l.ends_on) as on_leave
    from techs t cross join days d
  ),
  available as (
    select technician_id,
           sum(case when dow between 1 and 5 and not resting and not on_leave
                    then case when dow = 5 then v_settings.friday_hours else v_settings.daily_hours end
                    else 0 end) as hours,
           bool_and(on_leave or dow > 5) and bool_or(on_leave) as all_leave,
           bool_and(dow > 5) as closed
    from presence group by technician_id
  ),
  declared as (
    select r.technician_id, sum(l.estimated_hours) as hours, count(distinct r.id) as orders
    from public.ro_lines l
    join public.repair_orders r on r.id = l.repair_order_id
    where l.kind = 'done' and coalesce(l.estimated_hours, 0) > 0
      and r.technician_id is not null
      and public.paris_date(l.created_at) between p_from and p_to
    group by r.technician_id
  ),
  planned as (
    select r.technician_id, count(*) as orders, sum(public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end)) as hours
    from public.repair_orders r
    where r.technician_id is not null and r.planned_date between p_from and p_to
    group by r.technician_id
  ),
  -- Présence badgée à la borne : paires arrivée / départ, plus la présence en cours aujourd'hui.
  clocked as (
    select t.id as technician_id,
           coalesce((select sum(a.worked_seconds) from public.v_daily_attendance a
                     where a.technician_id = t.id and a.work_date between p_from and p_to), 0)
           + coalesce((select extract(epoch from now() - e.occurred_at)
                       from (select ce.occurred_at, ce.event_type from public.clock_events ce
                             where ce.technician_id = t.id and ce.work_date = v_today
                             order by ce.occurred_at desc limit 1) e
                       where e.event_type = 'in' and v_today between p_from and p_to), 0) as seconds
    from techs t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'technician_id', t.id,
           'name', t.display_name,
           'color', t.color,
           'available_hours', coalesce(a.hours, 0),
           'declared_hours', coalesce(dc.hours, 0),
           'worked_orders', coalesce(dc.orders, 0),
           'planned_hours', coalesce(p.hours, 0),
           'planned_orders', coalesce(p.orders, 0),
           'clocked_hours', round(coalesce(c.seconds, 0) / 3600.0, 2),
           'absence', case when coalesce(a.hours, 0) > 0 then null
                           when a.closed then 'closed'
                           when a.all_leave then 'leave' else 'rest' end)
         order by t.sort_order, t.display_name), '[]'::jsonb)
    into v_technicians
  from techs t
  left join available a on a.technician_id = t.id
  left join declared dc on dc.technician_id = t.id
  left join planned p on p.technician_id = t.id
  left join clocked c on c.technician_id = t.id;

  select jsonb_build_object('orders', count(*), 'hours', coalesce(sum(public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end)), 0))
    into v_to_plan
  from public.repair_orders r
  where r.status in ('assigned', 'in_progress', 'quote_pending')
    and (r.planned_date is null or r.technician_id is null or r.planned_date < v_today);

  return jsonb_build_object('from', p_from, 'to', p_to, 'technicians', v_technicians, 'to_plan', v_to_plan);
end;
$$;

create or replace function public.workshop_workload_detail(p_technician_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_office();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'declared', coalesce((
      select jsonb_agg(jsonb_build_object(
               'repair_order_id', r.id, 'number', r.number, 'plate', v.plate,
               'day', public.paris_date(l.created_at), 'description', split_part(l.description, E'\n', 1),
               'hours', l.estimated_hours)
             order by l.created_at, r.number)
      from public.ro_lines l
      join public.repair_orders r on r.id = l.repair_order_id
      left join public.vehicles v on v.id = r.vehicle_id
      where r.technician_id = p_technician_id and l.kind = 'done' and coalesce(l.estimated_hours, 0) > 0
        and public.paris_date(l.created_at) between p_from and p_to), '[]'::jsonb),
    'planned', coalesce((
      select jsonb_agg(jsonb_build_object(
               'repair_order_id', r.id, 'number', r.number, 'plate', v.plate, 'day', r.planned_date,
               'hours', public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end))
             order by r.planned_date, r.planned_start nulls last, r.number)
      from public.repair_orders r
      left join public.vehicles v on v.id = r.vehicle_id
      where r.technician_id = p_technician_id and r.planned_date between p_from and p_to), '[]'::jsonb));
end;
$$;
revoke execute on function public.workshop_workload_detail(uuid, date, date) from public, anon;
grant execute on function public.workshop_workload_detail(uuid, date, date) to authenticated;
