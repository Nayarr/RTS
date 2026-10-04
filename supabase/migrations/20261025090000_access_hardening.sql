-- =============================================================================
-- RTS Atelier : Durcissement des accès (audit)
--
--   - taux horaires négociés des clients réservés au bureau ;
--   - la borne ne lit plus directement clients, véhicules, OR, rendez-vous et congés
--     (l'écran télé passe par workshop_board, le pointage par kiosk_clock) ;
--   - borne : blocage de 15 minutes après 20 codes faux dans l'heure (en plus de la
--     limite de 5 par minute), avec une alerte dans la cloche de la direction.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Taux horaire d'un client : bureau seulement (et traitements serveur sans utilisateur)
-- ---------------------------------------------------------------------------
create or replace function public.labor_rate_for(p_client_id uuid, p_vehicle_type public.vehicle_type)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_office() then
    raise exception 'Accès refusé : tarifs réservés au bureau' using errcode = '42501';
  end if;
  return coalesce(
    (select c.hourly_rate from public.clients c where c.id = p_client_id),
    (select r.hourly_rate from public.labor_rates r where r.category = p_vehicle_type::text::public.labor_category),
    0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lectures de la borne retirées
-- ---------------------------------------------------------------------------
alter policy clients_select on public.clients using (
  public.is_office()
  or exists (select 1 from public.repair_orders r
             where r.client_id = clients.id and r.technician_id = public.current_technician_id()));

alter policy vehicles_select on public.vehicles using (
  public.is_office()
  or exists (select 1 from public.repair_orders r
             where r.vehicle_id = vehicles.id and r.technician_id = public.current_technician_id()));

alter policy repair_orders_select on public.repair_orders using (
  public.is_office() or technician_id = public.current_technician_id());

alter policy appointments_select on public.appointments using (public.is_office());

alter policy leave_requests_select on public.leave_requests using (
  public.is_office() or technician_id = public.current_technician_id());

-- ---------------------------------------------------------------------------
-- Borne : codes faux
-- ---------------------------------------------------------------------------
create or replace function public.kiosk_too_many_attempts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- 5 codes faux dans la minute, ou 20 dans l'heure : bloqué 15 minutes après le dernier.
  select (select count(*) from public.kiosk_failed_attempts where attempted_at > now() - interval '1 minute') >= 5
      or ((select count(*) from public.kiosk_failed_attempts where attempted_at > now() - interval '1 hour') >= 20
          and (select max(attempted_at) from public.kiosk_failed_attempts) > now() - interval '15 minutes');
$$;

-- Alerte à la direction dès 20 codes faux dans l'heure (une par heure au plus).
create or replace function public.kiosk_failed_attempts_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.kiosk_failed_attempts where attempted_at > now() - interval '1 hour') >= 20 then
    insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
    values ('direction', 'kiosk_lockout', 'Borne bloquée : trop de codes faux',
            'Au moins 20 codes PIN ou codes de sortie faux en une heure sur la borne de pointage.',
            '/pointages', 'kiosk-lockout-' || to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD-HH24'))
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end;
$$;

create trigger kiosk_failed_attempts_alert
  after insert on public.kiosk_failed_attempts
  for each row execute function public.kiosk_failed_attempts_alert();

revoke execute on function public.kiosk_failed_attempts_alert() from public, anon, authenticated;

-- Pointage : même fonction qu'avant, message de blocage adapté.
CREATE OR REPLACE FUNCTION public.kiosk_clock(p_pin text, p_photo_file_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    return jsonb_build_object('ok', false, 'message', 'Caméra indisponible : pointage impossible. Préviens le bureau.');
  end if;
  perform public.assert_confirmed_file(p_photo_file_id, 'clock_photo');

  if public.kiosk_too_many_attempts() then
    v_refusal := 'Trop de codes faux : borne bloquée quelques minutes. Préviens le bureau si besoin.';
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
