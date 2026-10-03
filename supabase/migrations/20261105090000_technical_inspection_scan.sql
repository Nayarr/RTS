-- Contrôle technique photographié depuis l'OR : sa lecture propose la date du prochain contrôle et le
-- VIN du véhicule. Le technicien les vérifie puis les enregistre depuis l'OR (droits de l'OR, comme
-- les échéances) : le VIN rejoint la fiche véhicule.

create or replace function public.update_vehicle_deadlines(p_repair_order_id uuid, p_patch jsonb)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_vehicle public.vehicles;
  v_key text;
  v_vin text;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('ct_due_date', 'tailgate_due_date', 'vin') then
      raise exception 'Champ non modifiable : %', v_key using errcode = '22023';
    end if;
  end loop;

  -- VIN : 17 caractères, sans I, O ni Q (norme ISO 3779) ; espaces et tirets ignorés.
  if p_patch ? 'vin' then
    v_vin := nullif(upper(regexp_replace(coalesce(p_patch ->> 'vin', ''), '[\s-]', '', 'g')), '');
    if v_vin is not null and v_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' then
      raise exception 'VIN invalide : 17 caractères (lettres sauf I, O, Q, et chiffres)' using errcode = '22023';
    end if;
  end if;

  update public.vehicles set
    ct_due_date       = case when p_patch ? 'ct_due_date' then (p_patch ->> 'ct_due_date')::date else ct_due_date end,
    tailgate_due_date = case when p_patch ? 'tailgate_due_date' then (p_patch ->> 'tailgate_due_date')::date else tailgate_due_date end,
    vin               = case when p_patch ? 'vin' then v_vin else vin end
  where id = v_ro.vehicle_id
  returning * into v_vehicle;

  return v_vehicle;
end;
$$;
