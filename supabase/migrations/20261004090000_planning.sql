-- =============================================================================
-- RTS Atelier — Planning et rendez-vous
--   - rendez-vous saisis librement (client / immatriculation retrouvés ou créés) ;
--   - un rendez-vous converti en OR ou annulé ne bouge plus ;
--   - « Le véhicule est arrivé : créer l'OR » tracé dans l'historique de l'OR ;
--   - vue de lecture des rendez-vous (planning, liste des rendez-vous).
-- =============================================================================

create or replace function public.save_appointment(
  p_client_name text,
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time default null,
  p_reason text default null,
  p_technician_id uuid default null,
  p_id uuid default null   -- rendez-vous modifié ; absent pour un nouveau
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_vehicle public.vehicles;
  v_appt public.appointments;
begin
  perform public.assert_office();

  if p_scheduled_date is null or p_start_time is null then
    raise exception 'Date et heure obligatoires' using errcode = '22023';
  end if;
  if coalesce(btrim(p_client_name), '') = '' and public.normalize_key(p_plate) = '' then
    raise exception 'Indique au moins le client ou l''immatriculation' using errcode = '22023';
  end if;
  if p_end_time is not null and p_end_time <= p_start_time then
    raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
  end if;

  -- Client et véhicule : mêmes règles que la création d'un OR.
  if coalesce(btrim(p_client_name), '') <> '' then
    select id into v_client_id from public.clients where name_key = public.normalize_key(p_client_name);
    if v_client_id is null then
      insert into public.clients (name) values (btrim(p_client_name)) returning id into v_client_id;
    end if;
  end if;

  if public.normalize_key(p_plate) <> '' then
    select * into v_vehicle from public.vehicles where plate_key = public.normalize_key(p_plate);
    if not found then
      insert into public.vehicles (plate, vehicle_type, client_id)
      values (upper(btrim(p_plate)), p_vehicle_type, v_client_id)
      returning * into v_vehicle;
    elsif v_vehicle.client_id is null and v_client_id is not null then
      update public.vehicles set client_id = v_client_id where id = v_vehicle.id returning * into v_vehicle;
    end if;
    v_client_id := coalesce(v_client_id, v_vehicle.client_id);
  end if;

  if p_id is null then
    insert into public.appointments (client_id, vehicle_id, vehicle_type, scheduled_date, start_time, end_time,
                                     reason, technician_id, created_by)
    values (v_client_id, v_vehicle.id, p_vehicle_type, p_scheduled_date, p_start_time, p_end_time,
            nullif(btrim(p_reason), ''), p_technician_id, auth.uid())
    returning * into v_appt;
  else
    update public.appointments
    set client_id = v_client_id,
        vehicle_id = v_vehicle.id,
        vehicle_type = p_vehicle_type,
        scheduled_date = p_scheduled_date,
        start_time = p_start_time,
        end_time = p_end_time,
        reason = nullif(btrim(p_reason), ''),
        technician_id = p_technician_id
    where id = p_id
    returning * into v_appt;
    if not found then
      raise exception 'Rendez-vous introuvable' using errcode = 'P0002';
    end if;
  end if;
  return v_appt;
end;
$$;

revoke execute on function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid)
  from public, anon;
grant execute on function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid)
  to authenticated;

-- Rendez-vous converti en OR ou annulé : figé (seuls le rappel et le lien vers l'OR peuvent encore changer).
create or replace function public.appointments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'planned' and not public.is_migration_context()
     and (new.status, new.scheduled_date, new.start_time, new.end_time, new.client_id, new.vehicle_id,
          new.vehicle_type, new.reason)
         is distinct from
         (old.status, old.scheduled_date, old.start_time, old.end_time, old.client_id, old.vehicle_id,
          old.vehicle_type, old.reason) then
    raise exception 'Ce rendez-vous n''est plus modifiable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.appointments_guard() from public, anon, authenticated;

create trigger appointments_guard
  before update on public.appointments
  for each row execute function public.appointments_guard();

-- « Le véhicule est arrivé : créer l'OR » : auteur et origine tracés dans l'historique.
create or replace function public.create_repair_order_from_appointment(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
                                    created_by)
  values (v_appt.vehicle_id, v_appt.client_id, v_appt.vehicle_type, v_appt.technician_id,
          coalesce(nullif(v_appt.reason, ''), 'Rendez-vous'),
          v_appt.scheduled_date, v_appt.start_time, v_appt.end_time, v_appt.id, v_appt.maintenance_contract_id,
          auth.uid())
  returning id into v_ro_id;

  update public.appointments set status = 'converted', repair_order_id = v_ro_id where id = p_appointment_id;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_ro_id, 'OR créé depuis le rendez-vous du ' || to_char(v_appt.scheduled_date, 'DD/MM/YYYY'), auth.uid());
  return v_ro_id;
end;
$$;

-- Rendez-vous avec client, véhicule, technicien et OR créé, en une lecture.
create view public.v_appointments_overview
with (security_invoker = on) as
select
  a.*,
  v.plate,
  c.name as client_name,
  t.display_name as technician_name,
  t.color as technician_color,
  r.number as repair_order_number
from public.appointments a
left join public.vehicles v on v.id = a.vehicle_id
left join public.clients c on c.id = a.client_id
left join public.technicians t on t.id = a.technician_id
left join public.repair_orders r on r.id = a.repair_order_id;

revoke all on public.v_appointments_overview from public, anon;
grant select on public.v_appointments_overview to authenticated;
