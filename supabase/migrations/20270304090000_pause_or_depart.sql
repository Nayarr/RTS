-- Départ badgé (pause ou fin de journée) : les chronos d'OR encore lancés par le technicien se mettent
-- en pause d'eux-mêmes à l'heure du départ. Avant, il devait penser à les arrêter un par un.
-- - Borne : départ à l'heure du serveur, tous ses chronos en cours s'arrêtent.
-- - Départ saisi par la direction (oubli) : seuls les chronos lancés avant cette heure s'arrêtent, à
--   cette heure ; un chrono relancé ensuite n'est pas touché.
-- - Arrêt comme une pause du technicien (stopped_by vide) : la direction reçoit « OR en pause » et
--   l'historique de l'OR le dit.

create function public.clock_events_pause_timers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entry public.time_entries;
begin
  for v_entry in
    update public.time_entries
       set ended_at = new.occurred_at
     where technician_id = new.technician_id
       and ended_at is null
       and started_at <= new.occurred_at
    returning *
  loop
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (v_entry.repair_order_id, 'Badgeage mis en pause au départ du technicien', new.entered_by);
  end loop;
  return null;
end;
$$;
revoke execute on function public.clock_events_pause_timers() from public, anon, authenticated;

create trigger clock_events_pause_timers
  after insert on public.clock_events
  for each row when (new.event_type = 'out')
  execute function public.clock_events_pause_timers();
