-- =============================================================================
-- Absences de quelques heures, d'une demi-journée ou de jours entiers
--
-- Une absence peut porter sur une plage horaire d'un seul jour (matin, après-midi, quelques
-- heures) : heures de début et de fin. Sans heures : jours entiers, comme avant. Deux absences
-- du même jour ne se chevauchent pas. La charge de travail retire ces heures du disponible.
-- =============================================================================

alter table public.leave_requests
  add column start_time time,
  add column end_time   time,
  add constraint leave_requests_time_range_check check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and end_time > start_time and starts_on = ends_on));
comment on column public.leave_requests.start_time is
  'Absence de quelques heures (un seul jour) : heure de début ; vide pour des jours entiers.';

drop function public.save_leave_request(public.leave_type, date, date, text, uuid);
create function public.save_leave_request(
  p_leave_type public.leave_type,
  p_starts_on date,
  p_ends_on date,
  p_comment text default null,
  p_technician_id uuid default null,   -- absent : demande du technicien connecté
  p_start_time time default null,      -- absence de quelques heures (un seul jour)
  p_end_time time default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_direction boolean := public.is_direction();
  v_technician_id uuid := coalesce(p_technician_id, public.current_technician_id());
  v_leave public.leave_requests;
begin
  if not v_direction and (v_technician_id is null or v_technician_id is distinct from public.current_technician_id()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'Dates invalides : la fin doit être le même jour ou après le début' using errcode = '22023';
  end if;
  if (p_start_time is null) <> (p_end_time is null)
     or (p_start_time is not null and (p_end_time <= p_start_time or p_ends_on <> p_starts_on)) then
    raise exception 'Heures invalides : une absence de quelques heures tient sur un seul jour, la fin après le début'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.technicians where id = v_technician_id) then
    raise exception 'Technicien introuvable' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.leave_requests
    where technician_id = v_technician_id and not is_deleted and status <> 'rejected'
      and starts_on <= p_ends_on and ends_on >= p_starts_on
      -- Deux absences de quelques heures le même jour : seulement si leurs heures se chevauchent
      and (start_time is null or p_start_time is null or (start_time < p_end_time and end_time > p_start_time))
  ) then
    raise exception 'Une absence existe déjà sur cette période' using errcode = '23P01';
  end if;

  insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, start_time, end_time, comment,
                                     status, decided_by, decided_at, created_by)
  values (v_technician_id, p_leave_type, p_starts_on, p_ends_on, p_start_time, p_end_time, nullif(btrim(p_comment), ''),
          case when v_direction then 'approved' else 'requested' end::public.leave_status,
          case when v_direction then auth.uid() end,
          case when v_direction then now() end,
          auth.uid())
  returning * into v_leave;
  return v_leave;
end;
$$;
revoke execute on function public.save_leave_request(public.leave_type, date, date, text, uuid, time, time) from public, anon;
grant execute on function public.save_leave_request(public.leave_type, date, date, text, uuid, time, time) to authenticated;

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
           sum(case when dow between 1 and 5 and not resting and not on_leave
                    then greatest(0, case when dow = 5 then v_settings.friday_hours else v_settings.daily_hours end
                                     - partial_hours)
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
