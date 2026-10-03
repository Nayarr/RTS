-- Création d'OR : la date prévue est gardée même sans heure de début.
-- Avant, elle était perdue si aucune heure n'était saisie (comportement repris de l'ancienne appli,
-- qui l'a corrigé depuis). Un OR daté sans heure apparaît ce jour-là chez le technicien (« Flexible »)
-- et dans le planning, sous la date.

create or replace function public.create_repair_order(
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_client_name text,
  p_requested_work text,
  p_mileage integer default null,
  p_technician_id uuid default null,
  p_planned_date date default null,
  p_planned_start time default null,
  p_planned_end time default null,
  p_signature_file_id uuid default null
)
returns public.repair_orders
language plpgsql
security definer
set search_path = ''
as $$
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
    planned_date, planned_start, planned_end, customer_signature_file_id, created_by)
  values (
    v_vehicle.id, coalesce(v_client_id, v_vehicle.client_id), p_vehicle_type, btrim(p_requested_work), p_mileage,
    p_technician_id,
    -- Date prévue gardée même sans heure (OR « flexible » ce jour-là) ; avec une heure sans date : aujourd'hui.
    case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end,
    p_planned_start, p_planned_end, p_signature_file_id, auth.uid())
  returning * into v_ro;

  return v_ro;
end;
$$;
