-- Retard en minutes entières écoulées : arrivée à 14:25:40 pour 14:00, 25 min de retard (et non 26).
-- La vue arrondissait à la minute la plus proche ; la notification de retard compte déjà les minutes
-- entières écoulées.

do $migration$
declare
  v_def text := pg_get_viewdef('public.v_daily_attendance'::regclass);
  v_old text := 'THEN ((EXTRACT(epoch FROM (((first_in';
  v_new text := 'THEN (floor(EXTRACT(epoch FROM (((first_in';
begin
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'v_daily_attendance : calcul du retard introuvable';
  end if;
  execute 'create or replace view public.v_daily_attendance with (security_invoker = on) as '
    || replace(v_def, v_old, v_new);
end;
$migration$;
