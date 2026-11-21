-- Alertes de pointage quand un badgeage manque :
-- - « Pas de départ badgé » : arrivé (ou revenu de pause) mais aucun départ badgé 15 minutes après la
--   fermeture (Réglages ; le samedi, ouverture + heures du samedi). Le chrono d'OR resté en cours est
--   signalé.
-- - « Pas encore arrivé » : toutes les fiches actives sont surveillées, y compris celles sans code PIN
--   (avant, seules les fiches qui badgent étaient surveillées).

-- Fin de journée d'un jour donné (le samedi : ouverture + heures du samedi)
create function public.attendance_day_end(p_day date)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select case when extract(isodow from p_day) = 6
              then (s.workday_start + make_interval(mins => (coalesce(s.saturday_hours, 0) * 60)::integer))::time
              else s.workday_end end
  from public.app_settings s
  limit 1;
$$;
revoke execute on function public.attendance_day_end(date) from public, anon, authenticated;

do $migration$
declare
  v_def text := pg_get_functiondef('public.attendance_alerts'::regproc);
  v_pin text := $old$    and exists (select 1 from public.technician_pins p where p.technician_id = t.id)
$old$;
  v_old_ret text := $old$  return v_count;
end;$old$;
  v_new_ret text := $new$  -- Arrivé ou revenu de pause (dernier badgeage du jour = une arrivée), pas de départ badgé
  -- 15 minutes après la fermeture : la direction est prévenue, avec le chrono d'OR resté en cours
  -- (date et heure complètes : une fermeture tardive + 15 minutes ne repasse pas par minuit)
  if now() > ((v_today + public.attendance_day_end(v_today)) at time zone 'Europe/Paris') + interval '15 minutes' then
    insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
    select 'direction', 'no_departure', 'Pas de départ badgé : ' || t.display_name,
           'Dernier badgeage : arrivée à ' || to_char(c.occurred_at at time zone 'Europe/Paris', 'HH24:MI')
             || ', aucun départ à '
             || to_char(((v_today + public.attendance_day_end(v_today)) + interval '15 minutes'), 'HH24:MI')
             || coalesce(' · chrono en cours sur ' || r.plates, ''),
           '/equipe/pointages', 'no-departure-' || t.id || '-' || v_today
    from public.technicians t
    join lateral (
      select e.occurred_at, e.event_type
      from public.clock_events e
      where e.technician_id = t.id and e.work_date = v_today
      order by e.occurred_at desc limit 1
    ) c on true
    left join lateral (
      select string_agg(coalesce(v.plate, ro.number), ', ' order by te.started_at) as plates
      from public.time_entries te
      join public.repair_orders ro on ro.id = te.repair_order_id
      left join public.vehicles v on v.id = ro.vehicle_id
      where te.technician_id = t.id and te.ended_at is null
    ) r on true
    where t.is_active
      and c.event_type = 'in'
    on conflict (dedupe_key) do nothing;
    get diagnostics v_rows = row_count; v_count := v_count + v_rows;
  end if;

  return v_count;
end;$new$;
begin
  if position(v_pin in v_def) = 0 or position(v_old_ret in v_def) = 0 then
    raise exception 'attendance_alerts : texte attendu introuvable';
  end if;
  execute replace(replace(v_def, v_pin, ''), v_old_ret, v_new_ret);
end;
$migration$;
