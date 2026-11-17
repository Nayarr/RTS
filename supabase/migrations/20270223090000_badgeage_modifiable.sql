-- Badgeage modifiable par la direction : heure (et sens arrivée / départ) d'un badgeage existant, de la
-- borne comme d'une correction manuelle. Motif obligatoire, heure et sens d'origine gardés, photo gardée.
-- Les heures et retards se recalculent (vue des présences journalières).

alter table public.clock_events
  add column original_occurred_at timestamptz,
  add column original_event_type public.clock_event_type,
  add column edited_at timestamptz,
  add column edited_by uuid references public.profiles (id) on delete set null,
  add column edit_reason text check (char_length(edit_reason) <= 300);
comment on column public.clock_events.original_occurred_at is
  'Badgeage modifié par la direction : heure d''origine (première modification).';
comment on column public.clock_events.edit_reason is 'Motif de la dernière modification par la direction.';

-- La borne reste protégée contre toute autre modification, y compris de l'historique de la modification
do $migration$
declare
  v_def text := pg_get_functiondef('public.clock_events_kiosk_guard'::regproc);
  v_old_new text := 'new.source, new.reason, new.entered_by)';
  v_new_new text := 'new.source, new.reason, new.entered_by, new.original_occurred_at, new.original_event_type,'
                    || ' new.edited_at, new.edited_by, new.edit_reason)';
  v_old_old text := 'old.source, old.reason, old.entered_by)';
  v_new_old text := 'old.source, old.reason, old.entered_by, old.original_occurred_at, old.original_event_type,'
                    || ' old.edited_at, old.edited_by, old.edit_reason)';
begin
  if position(v_old_new in v_def) = 0 or position(v_old_old in v_def) = 0 then
    raise exception 'clock_events_kiosk_guard : colonnes comparées introuvables';
  end if;
  execute replace(replace(v_def, v_old_new, v_new_new), v_old_old, v_new_old);
end;
$migration$;

create function public.update_clock_event(p_event_id uuid, p_time time, p_event_type public.clock_event_type,
                                          p_reason text)
returns public.clock_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.clock_events;
  v_at timestamptz;
begin
  perform public.assert_direction();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Indique le motif de la modification' using errcode = '22023';
  end if;
  if p_time is null or p_event_type is null then
    raise exception 'Indique l''heure et le sens du badgeage' using errcode = '22023';
  end if;
  select * into v_event from public.clock_events where id = p_event_id for update;
  if not found then
    raise exception 'Badgeage introuvable' using errcode = 'P0002';
  end if;
  -- Même journée : seule l'heure change
  v_at := (v_event.work_date + p_time) at time zone 'Europe/Paris';
  if v_at > now() + interval '5 minutes' then
    raise exception 'Un pointage ne peut pas être dans le futur' using errcode = '22023';
  end if;

  update public.clock_events
     set original_occurred_at = coalesce(original_occurred_at, occurred_at),
         original_event_type = coalesce(original_event_type, event_type),
         occurred_at = v_at,
         event_type = p_event_type,
         edited_at = now(),
         edited_by = auth.uid(),
         edit_reason = btrim(p_reason),
         -- Absence validée à cette nouvelle heure (créneau d'une absence de quelques heures)
         during_leave_type = (
           select l.leave_type from public.leave_requests l
           where l.technician_id = v_event.technician_id and l.status = 'approved' and not l.is_deleted
             and v_event.work_date between l.starts_on and l.ends_on
             and (l.start_time is null or (p_time >= l.start_time and p_time < l.end_time))
           limit 1)
   where id = p_event_id
  returning * into v_event;
  return v_event;
end;
$$;
revoke execute on function public.update_clock_event(uuid, time, public.clock_event_type, text) from public, anon;
grant execute on function public.update_clock_event(uuid, time, public.clock_event_type, text) to authenticated;
