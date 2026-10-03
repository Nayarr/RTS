-- Fiche de contrôle complète obligatoire : à la création de l'OR (direct ou depuis un devis accepté),
-- la direction peut exiger que tous les points OK / 50 % / HS de la fiche soient renseignés avant
-- « Travaux terminés » (usure, état des pneus, contrôles étiquettes / extincteurs / éclairage).

alter table public.repair_orders
  add column inspection_required boolean not null default false;
comment on column public.repair_orders.inspection_required is
  'Exigé par la direction : tous les points OK / 50 % / HS de la fiche de contrôle avant de terminer.';

-- Seule la direction pose ou retire l'exigence.
create or replace function public.repair_orders_guard_inspection_required()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.inspection_required is distinct from (case when tg_op = 'INSERT' then false else old.inspection_required end)
     and not (public.is_system_context() or public.is_direction()) then
    raise exception 'Réservé à la direction : fiche de contrôle complète obligatoire' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.repair_orders_guard_inspection_required() from public, anon, authenticated;
create trigger repair_orders_guard_inspection_required
  before insert or update of inspection_required on public.repair_orders
  for each row execute function public.repair_orders_guard_inspection_required();

-- Points OK / 50 % / HS non renseignés de la fiche (mêmes clés que l'appli).
create or replace function public.inspection_missing_points(p_data jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select
    (select count(*) from unnest(public.inspection_wear_fields()) as f
      where coalesce(p_data #>> array['usure', f], '') not in ('OK', '50', 'HS'))::integer
  + (select count(*) from unnest(array['avant_etat', 'arriere_etat']) as f
      where coalesce(p_data #>> array['pneus', f], '') not in ('OK', '50', 'HS'))::integer
  + (select count(*) from unnest(array['etiquettes', 'hayon', 'extincteur1', 'extincteur2', 'extincteur6', 'eclairage']) as f
      where coalesce(p_data #>> array['controles', f], '') not in ('OK', 'HS'))::integer;
$$;
revoke execute on function public.inspection_missing_points(jsonb) from public, anon;
grant execute on function public.inspection_missing_points(jsonb) to authenticated;

drop function public.create_repair_order(text, public.vehicle_type, text, text, integer, uuid, date, time, time, uuid);
create function public.create_repair_order(
  p_plate text,
  p_vehicle_type public.vehicle_type,
  p_client_name text,
  p_requested_work text,
  p_mileage integer default null,
  p_technician_id uuid default null,
  p_planned_date date default null,
  p_planned_start time default null,
  p_planned_end time default null,
  p_signature_file_id uuid default null,
  p_inspection_required boolean default false
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
    planned_date, planned_start, planned_end, customer_signature_file_id, created_by, inspection_required)
  values (
    v_vehicle.id, coalesce(v_client_id, v_vehicle.client_id), p_vehicle_type, btrim(p_requested_work), p_mileage,
    p_technician_id,
    -- Date prévue gardée même sans heure (OR « flexible » ce jour-là) ; avec une heure sans date : aujourd'hui.
    case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end,
    p_planned_start, p_planned_end, p_signature_file_id, auth.uid(), coalesce(p_inspection_required, false))
  returning * into v_ro;

  return v_ro;
end;
$$;
revoke execute on function public.create_repair_order(text, public.vehicle_type, text, text, integer, uuid, date, time, time, uuid, boolean)
  from public, anon;
grant execute on function public.create_repair_order(text, public.vehicle_type, text, text, integer, uuid, date, time, time, uuid, boolean)
  to authenticated;

drop function public.create_repair_order_from_quote(uuid, uuid, date, time, time);
create function public.create_repair_order_from_quote(
  p_quote_id uuid,
  p_technician_id uuid default null,
  p_planned_date date default null,
  p_planned_start time default null,
  p_planned_end time default null,
  p_inspection_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_ro_id uuid;
  v_summary text;
  v_standalone boolean;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;

  v_standalone := v_quote.repair_order_id is null;
  if not v_standalone then
    if v_quote.status <> 'accepted' then
      raise exception 'Le devis doit être accepté avant de créer l''OR' using errcode = 'P0001';
    end if;
    if v_quote.resulting_repair_order_id is not null then
      raise exception 'Un OR a déjà été créé pour ce devis' using errcode = 'P0001';
    end if;
  end if;
  if v_quote.vehicle_id is null then
    raise exception 'Renseigne l''immatriculation avant de créer l''OR' using errcode = 'P0001';
  end if;
  if v_quote.merged_into_repair_order_id is not null then
    raise exception 'Ce devis a déjà été rattaché à un OR' using errcode = 'P0001';
  end if;
  if p_planned_end is not null and (p_planned_start is null or p_planned_end <= p_planned_start) then
    raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
  end if;

  select string_agg(split_part(description, E'\n', 1), E'\n' order by position) into v_summary
  from public.quote_lines where quote_id = p_quote_id and section = 'planned' and line_type <> 'text';

  -- Technicien et date posés dès la création : la notification au technicien annonce le début prévu.
  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    planned_date, planned_start, planned_end,
                                    origin_repair_order_id, origin_quote_id, inspection_required)
  values (v_quote.vehicle_id, v_quote.client_id, v_quote.vehicle_type, p_technician_id,
          coalesce(nullif(v_summary, ''), 'Travaux issus du devis ' || coalesce(v_quote.number, '')),
          case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end,
          p_planned_start, p_planned_end,
          v_quote.repair_order_id, v_quote.id, coalesce(p_inspection_required, false))
  returning id into v_ro_id;

  perform set_config('rts.system', 'on', true);
  -- Travaux du devis -> travaux effectués : facturés au temps du devis, temps réel à saisir par le technicien
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours,
                               billed_hours, labor_category, unit_price, quantity, discount_percent, package_id,
                               source_quote_line_id)
  select v_ro_id, 'done', ql.position, ql.line_type, ql.description,
         -- Temps réel : saisi par le technicien (exigé avant « Travaux terminés »)
         null,
         ql.standard_hours,
         -- Facturation : le temps du devis accepté, quel que soit le temps réel
         case when ql.line_type in ('labor', 'package')
              then coalesce(ql.billed_hours, ql.standard_hours, ql.estimated_hours) end,
         ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent, ql.package_id,
         ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type in ('labor', 'package', 'text');
  -- Pièces : à commander, comme avant
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, quantity, unit_price,
                               discount_percent, part_id, supplier_id, purchase_price, shipping_cost, brand,
                               manufacturer_ref, oem_ref, order_status, source_quote_line_id)
  select v_ro_id, 'planned', ql.position, ql.line_type, ql.description, ql.quantity, ql.unit_price,
         ql.discount_percent, ql.part_id, ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand,
         ql.manufacturer_ref, ql.oem_ref, 'to_order'::public.part_order_status, ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type = 'part';
  perform set_config('rts.system', '', true);

  if v_standalone then
    update public.quotes set repair_order_id = v_ro_id where id = p_quote_id;
  else
    update public.quotes set resulting_repair_order_id = v_ro_id where id = p_quote_id;
    insert into public.ro_events (repair_order_id, label, actor_id)
    select v_quote.repair_order_id,
           'Devis accepté — nouvel OR ' || r.number || ' créé', auth.uid()
    from public.repair_orders r where r.id = v_ro_id;
  end if;
  return v_ro_id;
end;
$$;
revoke execute on function public.create_repair_order_from_quote(uuid, uuid, date, time, time, boolean) from public, anon;
grant execute on function public.create_repair_order_from_quote(uuid, uuid, date, time, time, boolean) to authenticated;

create or replace function public.complete_repair_order(p_repair_order_id uuid, p_quote_needed boolean default false)
returns public.repair_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_inspection jsonb;
  v_missing text[] := array[]::text[];
  v_count integer;
  v_side record;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  select count(*) into v_count from public.ro_lines
  where repair_order_id = p_repair_order_id and kind = 'done'
    and line_type in ('labor', 'package') and estimated_hours is null;
  if v_count > 0 then
    v_missing := v_missing || format('Temps réel manquant : %s tâche%s des travaux effectués',
                                     v_count, case when v_count > 1 then 's' else '' end);
  end if;

  select count(*) into v_count from public.ro_lines
  where repair_order_id = p_repair_order_id and kind = 'planned'
    and line_type in ('labor', 'package') and estimated_hours is null
    and not (line_type = 'package' and standard_hours is not null);
  if v_count > 0 then
    v_missing := v_missing || format('Temps estimé manquant : %s tâche%s à prévoir',
                                     v_count, case when v_count > 1 then 's' else '' end);
  end if;

  select data into v_inspection from public.inspections where repair_order_id = p_repair_order_id;

  if v_ro.inspection_required then
    v_count := public.inspection_missing_points(v_inspection);
    if v_count > 0 then
      v_missing := v_missing || format('Fiche de contrôle complète exigée : %s point%s OK / 50 %% / HS non renseigné%s',
                                       v_count, case when v_count > 1 then 's' else '' end,
                                       case when v_count > 1 then 's' else '' end);
    end if;
  end if;
  for v_side in select * from (values ('avant', 'avant'), ('arriere', 'arrière')) as s(key, label) loop
    if v_inspection #>> array['pneus', v_side.key || '_etat'] in ('50', 'HS')
       and coalesce(btrim(v_inspection #>> array['pneus', v_side.key || '_taille']), '') = '' then
      v_missing := v_missing || format('Taille des pneus %s obligatoire (%s)', v_side.label,
        case when v_inspection #>> array['pneus', v_side.key || '_etat'] = 'HS' then 'HS' else '50 %' end);
    end if;
  end loop;

  if v_inspection #>> '{controles,hayon}' = 'HS'
     and not exists (select 1 from public.ro_photos
                     where repair_order_id = p_repair_order_id and label = 'Étiquette contrôle hayon') then
    v_missing := v_missing || 'Photo de l’étiquette contrôle hayon obligatoire (HS)'::text;
  end if;

  if cardinality(v_missing) > 0 then
    raise exception 'À compléter avant de terminer : %', array_to_string(v_missing, ' ; ') using errcode = 'P0001';
  end if;

  update public.time_entries set ended_at = now()
   where repair_order_id = p_repair_order_id and ended_at is null;

  update public.repair_orders
     set status = case when p_quote_needed then 'quote_pending'::public.repair_order_status else 'work_done' end,
         completed_at = now()
   where id = p_repair_order_id
  returning * into v_ro;

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id,
          'Travaux marqués terminés' || case when p_quote_needed then ' — devis à faire' else '' end,
          auth.uid());
  return v_ro;
end;
$$;

-- La vue des OR reprend la nouvelle colonne.
drop view public.v_repair_orders_overview;
create view public.v_repair_orders_overview
with (security_invoker = on) as
select
  r.*,
  v.plate,
  v.plate_key,
  c.name as client_name,
  t.display_name as technician_name,
  t.color as technician_color,
  tm.worked_seconds,
  tm.running_since,
  (select count(*) from public.ro_lines l
    where l.repair_order_id = r.id and l.line_type = 'part' and l.order_status <> 'received') as parts_pending_count,
  (select count(*) from public.ro_lines l
    where l.repair_order_id = r.id and l.line_type = 'part' and l.order_status = 'to_order') as parts_to_order_count,
  (select coalesce(array_agg(lbl), '{}') from unnest(public.required_photo_labels(r.vehicle_type)) as lbl
    where not exists (select 1 from public.ro_photos p where p.repair_order_id = r.id and p.label = lbl)) as missing_photo_labels,
  (select coalesce(sum(l.estimated_hours), 0) from public.ro_lines l
    where l.repair_order_id = r.id and l.kind = 'done') as declared_hours
from public.repair_orders r
join public.vehicles v on v.id = r.vehicle_id
left join public.clients c on c.id = r.client_id
left join public.technicians t on t.id = r.technician_id
left join public.v_repair_order_time tm on tm.repair_order_id = r.id;
grant select on public.v_repair_orders_overview to authenticated;
