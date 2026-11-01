-- Charge atelier : le garage est ouvert le samedi (heures réglables), seul le dimanche est fermé.

alter table public.app_settings
  add column saturday_hours numeric(4,2) not null default 8
    constraint app_settings_saturday_hours_check check (saturday_hours between 0 and 24);
update public.app_settings set saturday_hours = daily_hours;

comment on column public.app_settings.saturday_hours is
  'Heures disponibles par technicien le samedi (charge atelier) ; 0 si l''atelier est fermé le samedi.';

CREATE OR REPLACE FUNCTION public.workshop_workload(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                     and l.start_time is null
                     and d.day between l.starts_on and l.ends_on) as on_leave,
           -- Absence de quelques heures ce jour-là (demi-journée, rendez-vous…)
           coalesce((select sum(extract(epoch from l.end_time - l.start_time) / 3600)
                     from public.leave_requests l
                     where l.technician_id = t.id and l.status = 'approved' and not l.is_deleted
                       and l.start_time is not null and l.starts_on = d.day), 0) as partial_hours
    from techs t cross join days d
  ),
  available as (
    select technician_id,
           sum(case when dow between 1 and 6 and not resting and not on_leave
                    then greatest(0, case dow when 5 then v_settings.friday_hours
                                              when 6 then v_settings.saturday_hours
                                              else v_settings.daily_hours end
                                     - partial_hours)
                    else 0 end) as hours,
           -- Atelier fermé : le dimanche, et le samedi s'il est réglé à 0 h
           bool_and(on_leave or dow = 7 or (dow = 6 and v_settings.saturday_hours = 0)) and bool_or(on_leave) as all_leave,
           bool_and(dow = 7 or (dow = 6 and v_settings.saturday_hours = 0)) as closed
    from presence group by technician_id
  ),
  declared as (
    select coalesce(l.technician_id, r.technician_id) as technician_id, sum(l.estimated_hours) as hours,
           count(distinct r.id) as orders
    from public.ro_lines l
    join public.repair_orders r on r.id = l.repair_order_id
    where l.kind = 'done' and coalesce(l.estimated_hours, 0) > 0
      and coalesce(l.technician_id, r.technician_id) is not null
      and public.paris_date(l.created_at) between p_from and p_to
    group by coalesce(l.technician_id, r.technician_id)
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
  ),
  -- Chrono des OR (badgeage sur un OR), coupé aux bornes de la période ; chrono en cours compris
  badged as (
    select e.technician_id,
           sum(extract(epoch from
                 least(coalesce(e.ended_at, now()), ((p_to + 1)::timestamp at time zone 'Europe/Paris'))
                 - greatest(e.started_at, (p_from::timestamp at time zone 'Europe/Paris')))) as seconds
    from public.time_entries e
    where e.technician_id is not null
      and e.started_at < ((p_to + 1)::timestamp at time zone 'Europe/Paris')
      and coalesce(e.ended_at, now()) > (p_from::timestamp at time zone 'Europe/Paris')
    group by e.technician_id
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
           'badged_hours', round(coalesce(b.seconds, 0) / 3600.0, 2),
           'absence', case when coalesce(a.hours, 0) > 0 then null
                           when a.closed then 'closed'
                           when a.all_leave then 'leave' else 'rest' end)
         order by t.sort_order, t.display_name), '[]'::jsonb)
    into v_technicians
  from techs t
  left join available a on a.technician_id = t.id
  left join declared dc on dc.technician_id = t.id
  left join planned p on p.technician_id = t.id
  left join clocked c on c.technician_id = t.id
  left join badged b on b.technician_id = t.id;

  select jsonb_build_object('orders', count(*), 'hours', coalesce(sum(public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end)), 0))
    into v_to_plan
  from public.repair_orders r
  where r.status in ('assigned', 'in_progress', 'quote_pending')
    and (r.planned_date is null or r.technician_id is null or r.planned_date < v_today);

  return jsonb_build_object('from', p_from, 'to', p_to, 'technicians', v_technicians, 'to_plan', v_to_plan);
end;
$function$;
