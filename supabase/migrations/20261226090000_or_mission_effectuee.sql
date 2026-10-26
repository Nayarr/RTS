-- =============================================================================
-- Mission donnée à la création de l'OR : directement dans les travaux effectués
--
-- Retour du client : un OR créé avec « Contrôle complet » pour mission n'avait rien dans les
-- travaux effectués ; le technicien devait réécrire la tâche, et la facture de l'OR restait
-- presque vide. Chaque ligne de la tâche à faire devient une tâche des travaux effectués (le
-- technicien donne son temps, exigé avant « Travaux terminés »). Création au bureau, depuis un
-- rendez-vous et OR dupliqué ; l'OR créé depuis un devis reprend déjà les lignes du devis.
-- « Rendez-vous », mis faute de motif, n'est pas une tâche.
-- OR déjà créés : seulement ceux pas encore commencés (assignés, sans travaux effectués ni badgeage).
-- =============================================================================

-- Une tâche par ligne de la mission (puces retirées, lignes vides ignorées)
create function public.mission_lines(p_requested_work text)
returns table (ord integer, description text)
language sql
immutable
set search_path = ''
as $$
  select (row_number() over (order by w.n))::integer - 1, left(w.line, 2000)
  from (
    select btrim(regexp_replace(line, '^\s*[-*•]\s*', '')) as line, n
    from unnest(string_to_array(coalesce(p_requested_work, ''), E'\n')) with ordinality as t(line, n)
  ) w
  where w.line <> '' and w.line <> 'Rendez-vous';
$$;
revoke execute on function public.mission_lines(text) from public, anon, authenticated;

-- Travaux effectués d'un OR tout juste créé : sa mission
create function public.add_mission_lines(p_repair_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_system text := current_setting('rts.system', true);
begin
  perform set_config('rts.system', 'on', true);
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description)
  select r.id, 'done', m.ord, 'labor', m.description
  from public.repair_orders r
  cross join lateral public.mission_lines(r.requested_work) m
  where r.id = p_repair_order_id;
  perform set_config('rts.system', coalesce(v_system, ''), true);
end;
$$;
revoke execute on function public.add_mission_lines(uuid) from public, anon, authenticated;

-- Création au bureau
CREATE OR REPLACE FUNCTION public.create_repair_order(p_plate text, p_vehicle_type vehicle_type, p_client_name text, p_requested_work text, p_mileage integer DEFAULT NULL::integer, p_technician_id uuid DEFAULT NULL::uuid, p_planned_date date DEFAULT NULL::date, p_planned_start time without time zone DEFAULT NULL::time without time zone, p_planned_end time without time zone DEFAULT NULL::time without time zone, p_signature_file_id uuid DEFAULT NULL::uuid, p_inspection_required boolean DEFAULT false)
 RETURNS repair_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_client_id uuid;
  v_vehicle public.vehicles;
  v_ro public.repair_orders;
begin
  perform public.assert_office();

  if public.normalize_key(p_plate) = '' then
    raise exception 'Indique l''immatriculation' using errcode = '22023';
  end if;
  if coalesce(btrim(p_requested_work), '') = '' then
    raise exception 'Indique la tâche à faire' using errcode = '22023';
  end if;
  if p_planned_end is not null and (p_planned_start is null or p_planned_end <= p_planned_start) then
    raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
  end if;

  -- Client : retrouvé par son nom normalisé (« Dupont SA » = « DUPONT-SA »), sinon créé.
  if coalesce(btrim(p_client_name), '') <> '' then
    select id into v_client_id from public.clients where name_key = public.normalize_key(p_client_name);
    if v_client_id is null then
      insert into public.clients (name) values (btrim(p_client_name)) returning id into v_client_id;
    end if;
  end if;

  -- Véhicule : retrouvé par sa plaque normalisée, sinon créé ; rattaché au client s'il n'en avait pas.
  select * into v_vehicle from public.vehicles where plate_key = public.normalize_key(p_plate);
  if not found then
    insert into public.vehicles (plate, vehicle_type, client_id)
    values (upper(btrim(p_plate)), p_vehicle_type, v_client_id)
    returning * into v_vehicle;
  elsif v_vehicle.client_id is null and v_client_id is not null then
    update public.vehicles set client_id = v_client_id where id = v_vehicle.id returning * into v_vehicle;
  end if;

  insert into public.repair_orders (
    vehicle_id, client_id, vehicle_type, requested_work, mileage, technician_id,
    planned_date, planned_start, planned_end, customer_signature_file_id, created_by, inspection_required)
  values (
    v_vehicle.id, coalesce(v_client_id, v_vehicle.client_id), p_vehicle_type, btrim(p_requested_work), p_mileage,
    p_technician_id,
    -- Date prévue gardée même sans heure (OR « flexible » ce jour-là) ; avec une heure sans date : aujourd'hui.
    case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end,
    p_planned_start, p_planned_end, p_signature_file_id, auth.uid(), coalesce(p_inspection_required, false))
  returning * into v_ro;

  -- Mission : directement dans les travaux effectués
  perform public.add_mission_lines(v_ro.id);
  return v_ro;
end;
$$;

-- Création depuis un rendez-vous
CREATE OR REPLACE FUNCTION public.create_repair_order_from_appointment(p_appointment_id uuid, p_inspection_required boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_appt public.appointments;
  v_ro_id uuid;
begin
  perform public.assert_office();
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Rendez-vous introuvable' using errcode = 'P0002';
  end if;
  if v_appt.status <> 'planned' then
    raise exception 'Ce rendez-vous n''est plus à venir' using errcode = 'P0001';
  end if;
  if v_appt.vehicle_id is null then
    raise exception 'Renseigne l''immatriculation du rendez-vous avant de créer l''OR' using errcode = 'P0001';
  end if;

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    planned_date, planned_start, planned_end, appointment_id, maintenance_contract_id,
                                    created_by, inspection_required)
  values (v_appt.vehicle_id, v_appt.client_id, v_appt.vehicle_type, v_appt.technician_id,
          coalesce(nullif(v_appt.reason, ''), 'Rendez-vous'),
          v_appt.scheduled_date, v_appt.start_time, v_appt.end_time, v_appt.id, v_appt.maintenance_contract_id,
          auth.uid(), coalesce(p_inspection_required, false))
  returning id into v_ro_id;
  perform public.add_mission_lines(v_ro_id);

  update public.appointments set status = 'converted', repair_order_id = v_ro_id where id = p_appointment_id;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_ro_id, 'OR créé depuis le rendez-vous du ' || to_char(v_appt.scheduled_date, 'DD/MM/YYYY'), auth.uid());
  return v_ro_id;
end;
$$;

-- OR dupliqué
CREATE OR REPLACE FUNCTION public.duplicate_repair_order(p_repair_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_ro public.repair_orders;
  v_id uuid;
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, requested_work, intervention_type,
                                    roadside_address, roadside_km, roadside_travel_hours, created_by)
  values (v_ro.vehicle_id, v_ro.client_id, v_ro.vehicle_type, v_ro.requested_work, v_ro.intervention_type,
          v_ro.roadside_address, v_ro.roadside_km, v_ro.roadside_travel_hours, auth.uid())
  returning id into v_id;
  perform public.add_mission_lines(v_id);

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_id, 'OR créé en dupliquant ' || v_ro.number, auth.uid());
  return v_id;
end;
$$;

-- OR pas encore commencés : la mission rejoint les travaux effectués
select set_config('rts.system', 'on', true);
insert into public.ro_lines (repair_order_id, kind, position, line_type, description)
select r.id, 'done', m.ord, 'labor', m.description
from public.repair_orders r
cross join lateral public.mission_lines(r.requested_work) m
where r.status = 'assigned' and r.origin_quote_id is null
  and not exists (select 1 from public.ro_lines l where l.repair_order_id = r.id and l.kind = 'done')
  and not exists (select 1 from public.time_entries t where t.repair_order_id = r.id);
select set_config('rts.system', '', true);
