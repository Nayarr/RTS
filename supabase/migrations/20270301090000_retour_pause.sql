-- Borne : retour de pause badgeable 5 minutes avant la fin de pause des Réglages (13 h 55 pour 14 h).
-- Avant : la borne refusait tout badgeage pendant 59 minutes après le départ en pause (2e badgeage du
-- jour) ; parti à 13 h 00, on ne pouvait revenir qu'à 13 h 59.
-- Maintenant : retour possible dès le plus tôt de ces deux heures :
--   - départ + 59 minutes (pause prise tôt, ex. 12 h 00 : retour possible à 12 h 59, comme avant) ;
--   - fin de pause (Réglages, 14:00 par défaut) moins 5 minutes, heure de Paris, si le départ est avant.
-- Une pause commencée après 13 h 55 (départ à 14 h 30…) garde ses 59 minutes.
-- Les retards ne changent pas : seule la première arrivée du jour compte, pas le retour de pause.

-- ---------------------------------------------------------------------------
-- Heure à partir de laquelle le retour de pause est accepté
-- ---------------------------------------------------------------------------
create function public.kiosk_pause_until(p_pause_start timestamptz, p_work_date date)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_pause_start < x.resume then least(p_pause_start + interval '59 minutes', x.resume)
              else p_pause_start + interval '59 minutes' end
  from (select ((p_work_date + coalesce((select s.lunch_end from public.app_settings s limit 1), time '14:00'))
                - interval '5 minutes') at time zone 'Europe/Paris' as resume) x;
$$;
comment on function public.kiosk_pause_until(timestamptz, date) is
  'Retour de pause possible à la borne : départ + 59 min, ou fin de pause (Réglages) - 5 min si plus tôt.';
revoke execute on function public.kiosk_pause_until(timestamptz, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Borne : refus et heure de retour affichée calculés avec cette règle
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_def text := pg_get_functiondef('public.kiosk_clock'::regproc);
  v_old text := $old$    -- Pause : le 2e badgeage du jour (un départ) bloque la borne 59 minutes
    elsif v_last.id is not null and v_last.event_type = 'out'
          and v_last.occurred_at > now() - interval '59 minutes'
          and (select count(*) from public.clock_events
               where technician_id = v_tech.id and work_date = v_today) = 2 then
      v_refusal := 'Pause en cours (' || v_tech.display_name || ') : re-badge possible dans '
                   || ceil(extract(epoch from (v_last.occurred_at + interval '59 minutes' - now())) / 60)::integer
                   || ' min.';$old$;
  v_new text := $new$    -- Pause : le 2e badgeage du jour (un départ) bloque la borne 59 minutes, au plus tard
    -- jusqu'à 5 minutes avant la fin de pause des Réglages (13 h 55 pour 14 h)
    elsif v_last.id is not null and v_last.event_type = 'out'
          and now() < public.kiosk_pause_until(v_last.occurred_at, v_today)
          and (select count(*) from public.clock_events
               where technician_id = v_tech.id and work_date = v_today) = 2 then
      v_refusal := 'Pause en cours (' || v_tech.display_name || ') : re-badge possible dans '
                   || ceil(extract(epoch from (public.kiosk_pause_until(v_last.occurred_at, v_today) - now()))
                           / 60)::integer
                   || ' min.';$new$;
  v_old_ret text := $old$                        then v_event.occurred_at + interval '59 minutes' end);$old$;
  v_new_ret text := $new$                        then public.kiosk_pause_until(v_event.occurred_at, v_today) end);$new$;
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
