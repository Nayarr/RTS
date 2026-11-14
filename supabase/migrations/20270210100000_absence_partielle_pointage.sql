-- Absence de quelques heures (ex. congés payés de 09:00 à 14:00) et pointage :
-- - « A badgé pendant son absence » seulement si le badgeage tombe dans le créneau de l'absence
--   (une absence d'une journée entière garde la règle : tout badgeage du jour).
-- - Retard : avec une absence qui couvre l'heure d'arrivée attendue, l'arrivée attendue devient la fin
--   de l'absence, avec la même tolérance (Réglages : retard après 09:05 pour 09:00, soit 5 minutes).
--   Absence jusqu'à 14:00, arrivée à 14:25 : 25 minutes de retard (et non 5 h 25).

-- ---------------------------------------------------------------------------
-- Absence au moment du badgeage
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_def text := pg_get_functiondef('public.clock_events_before_insert'::regproc);
  v_old text := $old$      and new.work_date between l.starts_on and l.ends_on$old$;
  v_new text := $new$      and new.work_date between l.starts_on and l.ends_on
      -- Absence de quelques heures : seulement dans son créneau
      and (l.start_time is null
           or ((new.occurred_at at time zone 'Europe/Paris')::time >= l.start_time
               and (new.occurred_at at time zone 'Europe/Paris')::time < l.end_time))$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans clock_events_before_insert : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

-- Badgeages déjà enregistrés hors du créneau d'une absence partielle : plus « pendant l'absence »
select set_config('rts.system', 'on', true);
update public.clock_events c
   set during_leave_type = null
 where c.during_leave_type is not null
   and not exists (
     select 1 from public.leave_requests l
     where l.technician_id = c.technician_id and l.status = 'approved' and not l.is_deleted
       and c.work_date between l.starts_on and l.ends_on
       and (l.start_time is null
            or ((c.occurred_at at time zone 'Europe/Paris')::time >= l.start_time
                and (c.occurred_at at time zone 'Europe/Paris')::time < l.end_time)));
select set_config('rts.system', '', true);

-- ---------------------------------------------------------------------------
-- Arrivée attendue du jour : fin d'une absence partielle qui couvre l'heure d'arrivée, sinon Réglages
-- ---------------------------------------------------------------------------
create function public.attendance_expected_arrival(p_technician_id uuid, p_day date)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select max(l.end_time) from public.leave_requests l
     where l.technician_id = p_technician_id and l.status = 'approved' and not l.is_deleted
       and l.start_time is not null and p_day between l.starts_on and l.ends_on
       and l.start_time <= s.expected_arrival and l.end_time > s.expected_arrival),
    s.expected_arrival)
  from public.app_settings s
  limit 1;
$$;
revoke execute on function public.attendance_expected_arrival(uuid, date) from public, anon;
grant execute on function public.attendance_expected_arrival(uuid, date) to authenticated;

create or replace view public.v_daily_attendance
with (security_invoker = on) as
 WITH ordered AS (
         SELECT ce.technician_id,
            ce.work_date,
            ce.event_type,
            ce.occurred_at,
            lead(ce.event_type) OVER w AS next_type,
            lead(ce.occurred_at) OVER w AS next_at,
            lag(ce.event_type) OVER w AS prev_type
           FROM public.clock_events ce
          WINDOW w AS (PARTITION BY ce.technician_id, ce.work_date ORDER BY ce.occurred_at)
        ), settings AS (
         SELECT app_settings.overtime_start,
            app_settings.late_tolerance,
            app_settings.expected_arrival
           FROM public.app_settings
        ), days AS (
         SELECT o.technician_id,
            o.work_date,
            (sum(
                CASE
                    WHEN ((o.event_type = 'in'::public.clock_event_type) AND (o.next_type = 'out'::public.clock_event_type)) THEN EXTRACT(epoch FROM (o.next_at - o.occurred_at))
                    ELSE (0)::numeric
                END))::bigint AS worked_seconds,
            (sum(
                CASE
                    WHEN ((o.event_type = 'in'::public.clock_event_type) AND (o.next_type = 'out'::public.clock_event_type)) THEN GREATEST((0)::numeric, EXTRACT(epoch FROM (o.next_at - GREATEST(o.occurred_at, ((o.work_date + s.overtime_start) AT TIME ZONE 'Europe/Paris'::text)))))
                    ELSE (0)::numeric
                END))::bigint AS overtime_seconds,
            count(*) FILTER (WHERE (((o.event_type = 'in'::public.clock_event_type) AND (o.next_type IS DISTINCT FROM 'out'::public.clock_event_type) AND (o.work_date < public.paris_date(now()))) OR ((o.event_type = 'out'::public.clock_event_type) AND (o.prev_type IS DISTINCT FROM 'in'::public.clock_event_type)))) AS anomalies,
            bool_or(((o.event_type = 'in'::public.clock_event_type) AND (o.next_type IS NULL))) AS open_session,
            min(o.occurred_at) FILTER (WHERE (o.event_type = 'in'::public.clock_event_type)) AS first_in,
            -- Tolérance des Réglages (retard après - arrivée attendue), appliquée à l'arrivée attendue du jour
            (s.late_tolerance - s.expected_arrival) AS tolerance,
            public.attendance_expected_arrival(o.technician_id, o.work_date) AS expected
           FROM (ordered o
             CROSS JOIN settings s)
          GROUP BY o.technician_id, o.work_date, s.overtime_start, s.late_tolerance, s.expected_arrival
        )
 SELECT d.technician_id,
    d.work_date,
    d.worked_seconds,
    d.overtime_seconds,
    d.anomalies,
    d.open_session,
    d.first_in,
        CASE
            WHEN (((d.first_in AT TIME ZONE 'Europe/Paris'::text))::time without time zone > (d.expected + d.tolerance)) THEN ((EXTRACT(epoch FROM (((d.first_in AT TIME ZONE 'Europe/Paris'::text))::time without time zone - d.expected)) / (60)::numeric))::integer
            ELSE 0
        END AS late_minutes
   FROM days d;
