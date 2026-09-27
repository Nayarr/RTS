-- =============================================================================
-- RTS Atelier — Borne de pointage et pointages
--   - la photo du pointage est vérifiée ; celle d'une tentative refusée est supprimée ;
--   - correction manuelle par la direction (oubli de badge, panne de la borne) ;
--   - un pointage de la borne ne se modifie ni ne se supprime ;
--   - état du code de sortie de la borne (sans jamais exposer son empreinte).
-- =============================================================================

create or replace function public.kiosk_clock(p_pin text, p_photo_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tech public.technicians;
  v_pin record;
  v_last public.clock_events;
  v_type public.clock_event_type;
  v_event public.clock_events;
  v_today date := public.paris_date(now());
  v_refusal text;
begin
  if not (public.is_kiosk() or public.is_direction()) then
    raise exception 'Accès refusé : compte borne requis' using errcode = '42501';
  end if;
  if p_photo_file_id is null then
    return jsonb_build_object('ok', false, 'message', 'Caméra indisponible — pointage impossible. Préviens le bureau.');
  end if;
  perform public.assert_confirmed_file(p_photo_file_id, 'clock_photo');

  if public.kiosk_too_many_attempts() then
    v_refusal := 'Trop de tentatives, patiente une minute.';
  elsif coalesce(p_pin, '') ~ '^\d{4,6}$' then
    for v_pin in
      select p.technician_id, p.pin_hash, p.algorithm, t.legacy_email
      from public.technician_pins p join public.technicians t on t.id = p.technician_id
      where t.is_active
    loop
      if v_pin.algorithm = 'bcrypt' and extensions.crypt(p_pin, v_pin.pin_hash) = v_pin.pin_hash then
        select * into v_tech from public.technicians where id = v_pin.technician_id;
        exit;
      elsif v_pin.algorithm = 'legacy_sha256'
            and encode(extensions.digest('rts:' || lower(coalesce(v_pin.legacy_email, '')) || ':' || p_pin, 'sha256'), 'hex') = v_pin.pin_hash then
        select * into v_tech from public.technicians where id = v_pin.technician_id;
        -- Ancien code (appli Firestore) : on le re-hache en bcrypt au passage.
        update public.technician_pins
           set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), algorithm = 'bcrypt'
         where technician_id = v_pin.technician_id;
        exit;
      end if;
    end loop;
  end if;

  if v_refusal is null and v_tech.id is null then
    insert into public.kiosk_failed_attempts (attempted_by) values (auth.uid());
    v_refusal := 'Code incorrect';
  end if;

  if v_refusal is null then
    select * into v_last from public.clock_events
    where technician_id = v_tech.id and work_date = v_today
    order by occurred_at desc limit 1;

    if v_last.id is not null and v_last.occurred_at > now() - interval '1 minute' then
      v_refusal := 'Déjà pointé il y a moins d''une minute ('
                   || case when v_last.event_type = 'in' then 'arrivée' else 'départ' end || ').';
    end if;
  end if;

  -- Tentative refusée : sa photo n'est rattachée à rien, elle est supprimée.
  if v_refusal is not null then
    update public.files set deleted_at = now()
    where id = p_photo_file_id and deleted_at is null
      and not exists (select 1 from public.clock_events where photo_file_id = p_photo_file_id);
    return jsonb_build_object('ok', false, 'message', v_refusal);
  end if;

  v_type := case when v_last.event_type = 'in' then 'out'::public.clock_event_type else 'in' end;

  insert into public.clock_events (technician_id, event_type, occurred_at, source, photo_file_id, entered_by)
  values (v_tech.id, v_type, now(), 'kiosk', p_photo_file_id, auth.uid())
  returning * into v_event;

  return jsonb_build_object(
    'ok', true,
    'technician_name', v_tech.display_name,
    'event_type', v_event.event_type,
    'occurred_at', v_event.occurred_at,
    'during_leave_type', v_event.during_leave_type);
end;
$$;

-- Correction manuelle (oubli de badge, panne de la borne) : heure de Paris, motif obligatoire.
create or replace function public.add_manual_clock_event(
  p_technician_id uuid,
  p_event_type public.clock_event_type,
  p_work_date date,
  p_time time,
  p_reason text
)
returns public.clock_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
  v_event public.clock_events;
begin
  perform public.assert_direction();
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Indique le motif de la correction' using errcode = '22023';
  end if;
  if p_work_date is null or p_time is null then
    raise exception 'Indique le jour et l''heure' using errcode = '22023';
  end if;
  v_at := (p_work_date + p_time) at time zone 'Europe/Paris';
  if v_at > now() + interval '5 minutes' then
    raise exception 'Un pointage ne peut pas être dans le futur' using errcode = '22023';
  end if;
  if not exists (select 1 from public.technicians where id = p_technician_id) then
    raise exception 'Technicien introuvable' using errcode = 'P0002';
  end if;

  insert into public.clock_events (technician_id, event_type, occurred_at, work_date, source, reason, entered_by)
  values (p_technician_id, p_event_type, v_at, p_work_date, 'manual', btrim(p_reason), auth.uid())
  returning * into v_event;
  return v_event;
end;
$$;

revoke execute on function public.add_manual_clock_event(uuid, public.clock_event_type, date, time, text)
  from public, anon;
grant execute on function public.add_manual_clock_event(uuid, public.clock_event_type, date, time, text)
  to authenticated;

-- Pointage de la borne : preuve de présence, jamais modifié ni supprimé (on ajoute une correction).
-- Seule la purge des photos (durée de conservation) peut encore le toucher.
create or replace function public.clock_events_kiosk_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Comptes de l'appli uniquement (les tâches internes et la reprise des données passent).
  if old.source = 'kiosk' and current_user in ('authenticated', 'anon') then
    if tg_op = 'DELETE'
       or (new.technician_id, new.event_type, new.occurred_at, new.work_date, new.source, new.reason, new.entered_by)
          is distinct from
          (old.technician_id, old.event_type, old.occurred_at, old.work_date, old.source, old.reason, old.entered_by) then
      raise exception 'Un pointage de la borne ne se modifie pas : ajoute une correction manuelle' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.clock_events_kiosk_guard() from public, anon, authenticated;

create trigger clock_events_kiosk_guard
  before update or delete on public.clock_events
  for each row execute function public.clock_events_kiosk_guard();

-- Le code de sortie de la borne est-il défini ? (direction)
create or replace function public.kiosk_exit_code_is_set()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_direction();
  return exists (select 1 from public.kiosk_secrets where exit_code_hash is not null);
end;
$$;

revoke execute on function public.kiosk_exit_code_is_set() from public, anon;
grant execute on function public.kiosk_exit_code_is_set() to authenticated;

-- Code de sortie : l'API refuse un UPDATE sans WHERE (extension safeupdate de Supabase).
create or replace function public.set_kiosk_exit_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_direction();
  if p_code !~ '^\d{4,6}$' then
    raise exception 'Le code doit contenir 4 à 6 chiffres' using errcode = '22023';
  end if;
  update public.kiosk_secrets
     set exit_code_hash = extensions.crypt(p_code, extensions.gen_salt('bf', 8)), updated_at = now()
   where id;
end;
$$;
