-- =============================================================================
-- RTS Atelier — Contrats d'entretien
--   - contrat saisi avec le client et ses véhicules (retrouvés ou créés) ;
--   - rendez-vous « entretien contrat » rattaché au contrat (l'OR créé à l'arrivée
--     du véhicule compte comme entretien du contrat) ;
--   - facture mensuelle du contrat préparée en brouillon ;
--   - vue de lecture : véhicules du contrat, dernier entretien, entretien à planifier.
-- =============================================================================

-- Client (par son nom) et véhicule (par sa plaque) retrouvés ou créés, comme à la création d'un OR.
create or replace function public.ensure_client_and_vehicle(
  p_client_name text,
  p_plate text,
  p_vehicle_type public.vehicle_type,
  out client_id uuid,
  out vehicle_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  if coalesce(btrim(p_client_name), '') <> '' then
    select c.id into client_id from public.clients c where c.name_key = public.normalize_key(p_client_name);
    if client_id is null then
      insert into public.clients (name) values (btrim(p_client_name)) returning id into client_id;
    end if;
  end if;

  if public.normalize_key(p_plate) <> '' then
    select * into v_vehicle from public.vehicles v where v.plate_key = public.normalize_key(p_plate);
    if not found then
      insert into public.vehicles (plate, vehicle_type, client_id)
      values (upper(btrim(p_plate)), coalesce(p_vehicle_type, 'pl'), client_id)
      returning * into v_vehicle;
    elsif v_vehicle.client_id is null and client_id is not null then
      update public.vehicles v set client_id = ensure_client_and_vehicle.client_id
      where v.id = v_vehicle.id returning * into v_vehicle;
    end if;
    vehicle_id := v_vehicle.id;
    client_id := coalesce(client_id, v_vehicle.client_id);
  end if;
end;
$$;

revoke execute on function public.ensure_client_and_vehicle(text, text, public.vehicle_type) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Rendez-vous : rattachement facultatif à un contrat d'entretien
-- ---------------------------------------------------------------------------
drop function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid);

create function public.save_appointment(
  p_client_name text,
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time default null,
  p_reason text default null,
  p_technician_id uuid default null,
  p_id uuid default null,                        -- rendez-vous modifié ; absent pour un nouveau
  p_maintenance_contract_id uuid default null    -- entretien prévu par un contrat
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids record;
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

  select * into v_ids from public.ensure_client_and_vehicle(p_client_name, p_plate, p_vehicle_type);

  if p_id is null then
    insert into public.appointments (client_id, vehicle_id, vehicle_type, scheduled_date, start_time, end_time,
                                     reason, technician_id, maintenance_contract_id, created_by)
    values (v_ids.client_id, v_ids.vehicle_id, p_vehicle_type, p_scheduled_date, p_start_time, p_end_time,
            nullif(btrim(p_reason), ''), p_technician_id, p_maintenance_contract_id, auth.uid())
    returning * into v_appt;
  else
    update public.appointments
    set client_id = v_ids.client_id,
        vehicle_id = v_ids.vehicle_id,
        vehicle_type = p_vehicle_type,
        scheduled_date = p_scheduled_date,
        start_time = p_start_time,
        end_time = p_end_time,
        reason = nullif(btrim(p_reason), ''),
        technician_id = p_technician_id,
        maintenance_contract_id = coalesce(p_maintenance_contract_id, maintenance_contract_id)
    where id = p_id
    returning * into v_appt;
    if not found then
      raise exception 'Rendez-vous introuvable' using errcode = 'P0002';
    end if;
  end if;
  return v_appt;
end;
$$;

revoke execute on function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Contrats
-- ---------------------------------------------------------------------------

-- Création ou modification d'un contrat : client, prestation, véhicules (plaques), fréquence, prix.
-- Le kilométrage de départ de chaque véhicule ajouté est son dernier kilométrage relevé.
create or replace function public.save_maintenance_contract(
  p_client_name text,
  p_service_description text,
  p_plates text[],
  p_frequency_months integer default null,
  p_frequency_km integer default null,
  p_monthly_price_ht numeric default null,
  p_starts_on date default null,
  p_id uuid default null
)
returns public.maintenance_contracts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id uuid;
  v_contract public.maintenance_contracts;
  v_plate text;
  v_ids record;
  v_vehicle_ids uuid[] := '{}';
begin
  perform public.assert_office();

  if coalesce(btrim(p_client_name), '') = '' then
    raise exception 'Indique le client' using errcode = '22023';
  end if;
  if coalesce(cardinality(array_remove(array(select public.normalize_key(x) from unnest(p_plates) x), '')), 0) = 0 then
    raise exception 'Indique au moins un véhicule' using errcode = '22023';
  end if;
  if coalesce(p_frequency_months, 0) <= 0 and coalesce(p_frequency_km, 0) <= 0 then
    raise exception 'Indique une fréquence (mois ou km)' using errcode = '22023';
  end if;

  select client_id into v_client_id from public.ensure_client_and_vehicle(p_client_name, null, null);

  if p_id is null then
    insert into public.maintenance_contracts (client_id, service_description, frequency_months, frequency_km,
                                              monthly_price_ht, starts_on)
    values (v_client_id, coalesce(btrim(p_service_description), ''), nullif(p_frequency_months, 0),
            nullif(p_frequency_km, 0), p_monthly_price_ht, coalesce(p_starts_on, public.paris_date(now())))
    returning * into v_contract;
  else
    update public.maintenance_contracts
    set client_id = v_client_id,
        service_description = coalesce(btrim(p_service_description), ''),
        frequency_months = nullif(p_frequency_months, 0),
        frequency_km = nullif(p_frequency_km, 0),
        monthly_price_ht = p_monthly_price_ht,
        starts_on = coalesce(p_starts_on, starts_on)
    where id = p_id and is_active
    returning * into v_contract;
    if not found then
      raise exception 'Contrat introuvable ou terminé' using errcode = 'P0002';
    end if;
  end if;

  foreach v_plate in array p_plates loop
    continue when public.normalize_key(v_plate) = '';
    select * into v_ids from public.ensure_client_and_vehicle(p_client_name, v_plate, 'pl');
    v_vehicle_ids := v_vehicle_ids || v_ids.vehicle_id;
    insert into public.maintenance_contract_vehicles (contract_id, vehicle_id, start_mileage)
    values (v_contract.id, v_ids.vehicle_id, (
      select r.mileage from public.repair_orders r
      where r.vehicle_id = v_ids.vehicle_id and r.mileage is not null
      order by r.created_at desc limit 1))
    on conflict (contract_id, vehicle_id) do nothing;
  end loop;

  delete from public.maintenance_contract_vehicles
  where contract_id = v_contract.id and vehicle_id <> all (v_vehicle_ids);
  return v_contract;
end;
$$;

revoke execute on function public.save_maintenance_contract(text, text, text[], integer, integer, numeric, date, uuid)
  from public, anon;
grant execute on function public.save_maintenance_contract(text, text, text[], integer, integer, numeric, date, uuid)
  to authenticated;

-- « Facturer le mois » : brouillon de facture avec la ligne du contrat (texte de l'ancienne appli).
create or replace function public.build_contract_invoice_draft(p_contract_id uuid, p_month date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.maintenance_contracts;
  v_month date := date_trunc('month', coalesce(p_month, public.paris_date(now())))::date;
  v_plates text;
  v_invoice_id uuid;
  v_month_label text;
begin
  perform public.assert_office();
  select * into v_contract from public.maintenance_contracts where id = p_contract_id;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_contract.monthly_price_ht is null or v_contract.monthly_price_ht <= 0 then
    raise exception 'Indique le prix mensuel du contrat avant de le facturer' using errcode = 'P0001';
  end if;

  select string_agg(v.plate, ', ' order by v.plate) into v_plates
  from public.maintenance_contract_vehicles mcv join public.vehicles v on v.id = mcv.vehicle_id
  where mcv.contract_id = p_contract_id;

  v_month_label := (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
                          'octobre', 'novembre', 'décembre'])[extract(month from v_month)::int]
                   || ' ' || extract(year from v_month)::int;

  insert into public.invoices (client_id, vehicle_label, maintenance_contract_id, service_date, created_by)
  values (v_contract.client_id, 'Contrat d''entretien', p_contract_id, v_month, auth.uid())
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
  values (v_invoice_id, 0, 'package',
          'Contrat d''entretien — ' || coalesce(nullif(v_contract.service_description, ''), 'entretien') || ' — '
            || v_month_label || coalesce(E'\nVéhicules : ' || v_plates, ''),
          v_contract.monthly_price_ht, 1, (select default_vat_rate from public.company_settings));
  return v_invoice_id;
end;
$$;

revoke execute on function public.build_contract_invoice_draft(uuid, date) from public, anon;
grant execute on function public.build_contract_invoice_draft(uuid, date) to authenticated;

-- Contrats avec leur client et l'état de chaque véhicule (dernier entretien, entretien à planifier).
create view public.v_contracts_overview
with (security_invoker = on) as
select
  mc.*,
  c.name as client_name,
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'vehicle_id', s.vehicle_id,
             'plate', s.plate,
             'vehicle_type', v.vehicle_type,
             'last_service_at', s.last_service_at,
             'km_since_service', s.km_since_service,
             'appointment_planned', s.appointment_planned,
             'service_due', coalesce(s.service_due, false))
           order by s.plate)
    from public.v_contract_vehicle_status s
    join public.vehicles v on v.id = s.vehicle_id
    where s.contract_id = mc.id
  ), (
    -- contrat terminé : la vue d'état ne le suit plus, on liste seulement ses véhicules
    select jsonb_agg(jsonb_build_object('vehicle_id', v.id, 'plate', v.plate, 'vehicle_type', v.vehicle_type)
                     order by v.plate)
    from public.maintenance_contract_vehicles mcv join public.vehicles v on v.id = mcv.vehicle_id
    where mcv.contract_id = mc.id
  ), '[]'::jsonb) as vehicles
from public.maintenance_contracts mc
join public.clients c on c.id = mc.client_id;

revoke all on public.v_contracts_overview from public, anon;
grant select on public.v_contracts_overview to authenticated;
