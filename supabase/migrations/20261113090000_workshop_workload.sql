-- =============================================================================
-- Charge de travail atelier, par jour, semaine ou mois
--
-- Pour chaque technicien du planning, sur la période :
--   * déclaré : temps saisi par le mécanicien dans les travaux effectués, compté le jour de
--     la saisie, et nombre d'OR travaillés ;
--   * disponible : heures d'ouverture des Réglages (lundi à jeudi, vendredi), hors lundi de
--     repos tournant et congés acceptés (week-end : atelier fermé) ;
--   * planifié : OR prévus sur la période (durée du créneau, sinon temps prévu des travaux).
-- Plus les OR à planifier ou en retard (sans date, sans technicien, ou date passée) avec
-- leur temps estimé. Lecture réservée au bureau.
-- =============================================================================

-- Temps prévu d'un OR : créneau du planning, sinon temps des travaux (devis, puis estimation).
create or replace function public.repair_order_planned_hours(p_id uuid, p_start time, p_end time)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    case when p_start is not null and p_end is not null
         then round((extract(epoch from (p_end - p_start)) / 3600)::numeric, 2) end,
    (select sum(coalesce(l.billed_hours, l.estimated_hours)) from public.ro_lines l
      where l.repair_order_id = p_id and l.kind = 'done'),
    0);
$$;

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
           'absence', case when coalesce(a.hours, 0) > 0 then null
                           when a.closed then 'closed'
                           when a.all_leave then 'leave' else 'rest' end)
         order by t.sort_order, t.display_name), '[]'::jsonb)
    into v_technicians
  from techs t
  left join available a on a.technician_id = t.id
  left join declared dc on dc.technician_id = t.id
  left join planned p on p.technician_id = t.id;

  select jsonb_build_object('orders', count(*), 'hours', coalesce(sum(public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end)), 0))
    into v_to_plan
  from public.repair_orders r
  where r.status in ('assigned', 'in_progress', 'quote_pending')
    and (r.planned_date is null or r.technician_id is null or r.planned_date < v_today);

  return jsonb_build_object('from', p_from, 'to', p_to, 'technicians', v_technicians, 'to_plan', v_to_plan);
end;
$$;

revoke execute on function public.repair_order_planned_hours(uuid, time, time) from public, anon, authenticated;
revoke execute on function public.workshop_workload(date, date) from public, anon;
grant execute on function public.workshop_workload(date, date) to authenticated;
