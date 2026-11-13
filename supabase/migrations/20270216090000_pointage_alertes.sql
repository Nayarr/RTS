-- Pointage : pause minimale, notifications d'arrivée et de départ, retards.
-- - Le 2e badgeage de la journée (un départ) ouvre la pause : pendant 59 minutes, la borne refuse tout
--   badgeage en donnant le temps restant.
-- - Pause de plus de 1 h 05 sans re-badge : notification à la direction, sauf absence validée qui couvre
--   le reste de la journée.
-- - Chaque badgeage à la borne (ou saisi dans le quart d'heure) : notification à la direction.
-- - Retards : arrivée après l'heure de tolérance (Réglages), ou personne pas encore arrivée à cette heure
--   un jour travaillé (ni dimanche, ni samedi fermé, ni lundi de repos, ni congé validé).
--   Seules les fiches qui ont un code PIN (qui badgent vraiment) sont surveillées.

-- Heure du premier badgeage possible (Réglages) : avant, la borne refuse (08:55 par défaut)
alter table public.app_settings add column earliest_clock_in time not null default '08:55';
comment on column public.app_settings.earliest_clock_in is
  'Heure à partir de laquelle la borne accepte un badgeage (avant : refusé, aucune notification).';

-- ---------------------------------------------------------------------------
-- Jour non travaillé d'une fiche (repos, fermeture, congé validé d'une journée entière)
-- ---------------------------------------------------------------------------
create function public.attendance_day_off(p_technician_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select extract(isodow from p_day) = 7
      or (extract(isodow from p_day) = 6 and coalesce(s.saturday_hours, 0) = 0)
      -- Lundi de repos : un lundi sur deux, groupe A à partir du lundi de référence (comme la charge)
      or (extract(isodow from p_day) = 1 and t.rest_group is not null and s.rest_reference_monday is not null
          and t.rest_group = case when (((p_day - s.rest_reference_monday) / 7) % 2 + 2) % 2 = 0
                                  then 'A'::public.rest_group else 'B'::public.rest_group end)
      or exists (select 1 from public.leave_requests l
                 where l.technician_id = p_technician_id and l.status = 'approved' and not l.is_deleted
                   and l.start_time is null and p_day between l.starts_on and l.ends_on)
  from public.technicians t
  cross join (select * from public.app_settings limit 1) s
  where t.id = p_technician_id;
$$;
revoke execute on function public.attendance_day_off(uuid, date) from public, anon, authenticated;

-- Absence validée de quelques heures qui couvre l'heure donnée (demi-journée, rendez-vous…)
create function public.attendance_partial_leave_at(p_technician_id uuid, p_day date, p_time time)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.leave_requests l
                 where l.technician_id = p_technician_id and l.status = 'approved' and not l.is_deleted
                   and l.start_time is not null and l.starts_on = p_day
                   and l.start_time <= p_time and l.end_time > p_time);
$$;
revoke execute on function public.attendance_partial_leave_at(uuid, date, time) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Borne : 59 minutes de pause après le 2e badgeage du jour
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_def text := pg_get_functiondef('public.kiosk_clock'::regproc);
  v_old text := $old$      v_refusal := 'Déjà pointé il y a moins d''une minute ('
                   || case when v_last.event_type = 'in' then 'arrivée' else 'départ' end || ').';
    end if;$old$;
  v_new text := $new$      v_refusal := 'Déjà pointé il y a moins d''une minute ('
                   || case when v_last.event_type = 'in' then 'arrivée' else 'départ' end || ').';
    -- Trop tôt : la borne n'accepte rien avant l'heure réglée (08:55 par défaut)
    elsif (now() at time zone 'Europe/Paris')::time
          < coalesce((select s.earliest_clock_in from public.app_settings s limit 1), time '08:55') then
      v_refusal := 'Badgeage possible à partir de '
                   || to_char(coalesce((select s.earliest_clock_in from public.app_settings s limit 1),
                                       time '08:55'), 'HH24"h"MI') || '.';
    -- Pause : le 2e badgeage du jour (un départ) bloque la borne 59 minutes
    elsif v_last.id is not null and v_last.event_type = 'out'
          and v_last.occurred_at > now() - interval '59 minutes'
          and (select count(*) from public.clock_events
               where technician_id = v_tech.id and work_date = v_today) = 2 then
      v_refusal := 'Pause en cours (' || v_tech.display_name || ') : re-badge possible dans '
                   || ceil(extract(epoch from (v_last.occurred_at + interval '59 minutes' - now())) / 60)::integer
                   || ' min.';
    end if;$new$;
  v_old_ret text := $old$    'during_leave_type', v_event.during_leave_type);$old$;
  v_new_ret text := $new$    'during_leave_type', v_event.during_leave_type,
    -- Début de pause (2e badgeage du jour) : heure à partir de laquelle on peut re-badger
    'pause_until', case when v_event.event_type = 'out'
                         and (select count(*) from public.clock_events
                              where technician_id = v_tech.id and work_date = v_today) = 2
                        then v_event.occurred_at + interval '59 minutes' end);$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans kiosk_clock : %', v_old;
  end if;
  if position(v_old_ret in v_def) = 0 then
    raise exception 'Texte introuvable dans kiosk_clock : %', v_old_ret;
  end if;
  execute replace(replace(v_def, v_old, v_new), v_old_ret, v_new_ret);
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Notification à chaque badgeage (et retard à l'arrivée)
-- ---------------------------------------------------------------------------
create function public.clock_events_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_rank integer;
  v_time time := (new.occurred_at at time zone 'Europe/Paris')::time;
  v_settings record;
  v_title text;
begin
  -- Correction faite après coup (oubli de badge) : pas de notification
  if new.occurred_at < now() - interval '15 minutes' or public.is_migration_context() then
    return null;
  end if;
  select display_name into v_name from public.technicians where id = new.technician_id;
  select count(*) into v_rank from public.clock_events
  where technician_id = new.technician_id and work_date = new.work_date and occurred_at <= new.occurred_at;

  v_title := case
    when new.event_type = 'in' and v_rank = 1 then 'Arrivée : '
    when new.event_type = 'out' and v_rank = 2 then 'Départ en pause : '
    when new.event_type = 'in' and v_rank = 3 then 'Retour de pause : '
    when new.event_type = 'in' then 'Arrivée : '
    else 'Départ : ' end || coalesce(v_name, '-') || ' ' || to_char(v_time, 'HH24:MI');

  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  values ('direction', case when new.event_type = 'in' then 'clock_in' else 'clock_out' end, v_title,
          case when new.source = 'kiosk' then 'Badgé à la borne' else 'Pointage saisi' end,
          '/equipe/pointages', 'clock-' || new.id)
  on conflict (dedupe_key) do nothing;

  -- Première arrivée du jour après l'arrivée attendue + tolérance : retard. Absence de quelques heures
  -- le matin : arrivée attendue à la fin de l'absence (comme le relevé des pointages).
  if new.event_type = 'in' and v_rank = 1 then
    select expected_arrival, late_tolerance,
           public.attendance_expected_arrival(new.technician_id, new.work_date) as expected
      into v_settings from public.app_settings limit 1;
    if v_time > v_settings.expected + (v_settings.late_tolerance - v_settings.expected_arrival)
       and not public.attendance_day_off(new.technician_id, new.work_date) then
      insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
      values ('direction', 'late_arrival', 'Retard : ' || coalesce(v_name, '-'),
              'Arrivé à ' || to_char(v_time, 'HH24:MI') || ', attendu à ' || to_char(v_settings.expected, 'HH24:MI')
                || ' (' || floor(extract(epoch from (v_time - v_settings.expected)) / 60)::integer || ' min)',
              '/equipe/pointages', 'late-' || new.technician_id || '-' || new.work_date)
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.clock_events_notify() from public, anon, authenticated;

create trigger clock_events_notify
  after insert on public.clock_events
  for each row execute function public.clock_events_notify();

-- ---------------------------------------------------------------------------
-- Tâche planifiée : personne pas encore arrivée, pause trop longue
-- ---------------------------------------------------------------------------
create function public.attendance_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
  v_now time := (now() at time zone 'Europe/Paris')::time;
  v_settings record;
  v_count integer := 0;
  v_rows integer;
begin
  select late_tolerance, expected_arrival, workday_end into v_settings from public.app_settings limit 1;

  -- Pas encore arrivé à l'arrivée attendue + tolérance, un jour travaillé (absence de quelques heures
  -- le matin : contrôle à la fin de l'absence + tolérance, ex. 14:05 pour une absence jusqu'à 14:00)
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'not_arrived', 'Pas encore arrivé : ' || t.display_name,
         'Aucun badgeage à ' || to_char(x.deadline, 'HH24:MI')
           || ' (attendu à ' || to_char(x.expected, 'HH24:MI') || ')',
         '/equipe/pointages', 'not-arrived-' || t.id || '-' || v_today
  from public.technicians t
  cross join lateral (
    select public.attendance_expected_arrival(t.id, v_today) as expected,
           public.attendance_expected_arrival(t.id, v_today)
             + (v_settings.late_tolerance - v_settings.expected_arrival) as deadline
  ) x
  where t.is_active
    and v_now > x.deadline
    and exists (select 1 from public.technician_pins p where p.technician_id = t.id)
    and not exists (select 1 from public.clock_events c where c.technician_id = t.id and c.work_date = v_today)
    and not public.attendance_day_off(t.id, v_today)
    and not public.attendance_partial_leave_at(t.id, v_today, x.deadline)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Pause commencée (2e badgeage du jour) il y a plus de 1 h 05, pas de retour badgé
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'pause_overrun', 'Pause dépassée : ' || t.display_name,
         'Parti en pause à ' || to_char(c.occurred_at at time zone 'Europe/Paris', 'HH24:MI')
           || ', pas de retour badgé après 1 h 05',
         '/equipe/pointages', 'pause-' || t.id || '-' || v_today
  from public.technicians t
  join lateral (
    select e.occurred_at, e.event_type,
           (select count(*) from public.clock_events x where x.technician_id = t.id and x.work_date = v_today) as n
    from public.clock_events e
    where e.technician_id = t.id and e.work_date = v_today
    order by e.occurred_at desc limit 1
  ) c on true
  where t.is_active
    and c.n = 2 and c.event_type = 'out'
    and c.occurred_at < now() - interval '65 minutes'
    -- Absence validée qui couvre le reste de la journée (après-midi de congé…)
    and not exists (
      select 1 from public.leave_requests l
      where l.technician_id = t.id and l.status = 'approved' and not l.is_deleted
        and l.start_time is not null and l.starts_on = v_today
        and l.start_time <= ((c.occurred_at + interval '65 minutes') at time zone 'Europe/Paris')::time
        and l.end_time >= v_settings.workday_end)
    and not public.attendance_day_off(t.id, v_today)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  return v_count;
end;
$$;
revoke execute on function public.attendance_alerts() from public, anon, authenticated;

-- Planification (pg_cron), toutes les minutes
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rts-attendance-alerts', '* * * * *', 'select public.attendance_alerts()');
  else
    raise notice 'pg_cron indisponible : tâche planifiée non créée';
  end if;
end;
$$;
