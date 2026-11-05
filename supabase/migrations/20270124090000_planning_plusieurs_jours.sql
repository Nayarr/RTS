-- =============================================================================
-- Planning sur plusieurs jours : un véhicule qui commence le soir et finit le
-- lendemain matin.
--   - date de fin facultative sur les OR et les rendez-vous (vide = même jour) ;
--   - renseignée seulement si elle est après la date de début, avec les deux heures ;
--   - si un déplacement rend la fin incohérente, la date de fin est retirée.
-- =============================================================================

alter table public.repair_orders add column planned_end_date date;
alter table public.appointments add column end_date date;

comment on column public.repair_orders.planned_end_date is
  'Dernier jour prévu quand l''OR déborde sur un autre jour ; vide = même jour que planned_date.';
comment on column public.appointments.end_date is
  'Dernier jour prévu quand le rendez-vous déborde sur un autre jour ; vide = même jour que scheduled_date.';

alter table public.repair_orders drop constraint repair_orders_planning_check;
alter table public.repair_orders add constraint repair_orders_planning_check check (
  (planned_end is null or planned_start is null or planned_end_date is not null or planned_end > planned_start)
  and (planned_end_date is null
       or (planned_date is not null and planned_start is not null and planned_end is not null
           and planned_end_date > planned_date))
);

alter table public.appointments drop constraint appointments_time_check;
alter table public.appointments add constraint appointments_time_check check (
  (end_time is null or end_date is not null or end_time > start_time)
  and (end_date is null or (end_time is not null and end_date > scheduled_date))
);

-- ---------------------------------------------------------------------------
-- Date de fin retirée quand elle n'a plus de sens (OR ou rendez-vous déplacé, heure effacée)
-- ---------------------------------------------------------------------------
create function public.repair_orders_normalize_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.planned_end_date is not null
     and (new.planned_date is null or new.planned_start is null or new.planned_end is null
          or new.planned_end_date <= new.planned_date) then
    new.planned_end_date := null;
    if new.planned_end <= new.planned_start then
      new.planned_end := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.repair_orders_normalize_end() from public, anon, authenticated;

create trigger repair_orders_normalize_end
  before insert or update of planned_date, planned_start, planned_end, planned_end_date on public.repair_orders
  for each row execute function public.repair_orders_normalize_end();

create function public.appointments_normalize_end()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.end_date is not null and (new.end_time is null or new.end_date <= new.scheduled_date) then
    new.end_date := null;
    if new.end_time <= new.start_time then
      new.end_time := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.appointments_normalize_end() from public, anon, authenticated;

create trigger appointments_normalize_end
  before insert or update of scheduled_date, start_time, end_time, end_date on public.appointments
  for each row execute function public.appointments_normalize_end();

-- ---------------------------------------------------------------------------
-- Rendez-vous
-- ---------------------------------------------------------------------------
drop function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid, uuid);

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
  p_maintenance_contract_id uuid default null,   -- entretien prévu par un contrat
  p_end_date date default null                   -- dernier jour, si le rendez-vous déborde sur un autre jour
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids record;
  v_appt public.appointments;
  v_end_date date := nullif(p_end_date, p_scheduled_date);
begin
  perform public.assert_office();

  if p_scheduled_date is null or p_start_time is null then
    raise exception 'Date et heure obligatoires' using errcode = '22023';
  end if;
  if coalesce(btrim(p_client_name), '') = '' and public.normalize_key(p_plate) = '' then
    raise exception 'Indique au moins le client ou l''immatriculation' using errcode = '22023';
  end if;
  if v_end_date < p_scheduled_date then
    raise exception 'La date de fin doit être après la date de début' using errcode = '22023';
  end if;
  if v_end_date is not null and p_end_time is null then
    raise exception 'Indique l''heure de fin' using errcode = '22023';
  end if;
  if v_end_date is null and p_end_time is not null and p_end_time <= p_start_time then
    raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
  end if;

  select * into v_ids from public.ensure_client_and_vehicle(p_client_name, p_plate, p_vehicle_type);

  if p_id is null then
    insert into public.appointments (client_id, vehicle_id, vehicle_type, scheduled_date, start_time, end_time, end_date,
                                     reason, technician_id, maintenance_contract_id, created_by)
    values (v_ids.client_id, v_ids.vehicle_id, p_vehicle_type, p_scheduled_date, p_start_time, p_end_time, v_end_date,
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
        end_date = v_end_date,
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

revoke execute on function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid, uuid, date)
  from public, anon;
grant execute on function public.save_appointment(text, text, public.vehicle_type, date, time, time, text, uuid, uuid, uuid, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Nouvel OR
-- ---------------------------------------------------------------------------
drop function public.create_repair_order(text, public.vehicle_type, text, text, integer, uuid, date, time, time, uuid, boolean);

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
  p_inspection_required boolean default false,
  p_planned_end_date date default null
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
  v_planned_date date :=
    -- Date prévue gardée même sans heure (OR « flexible » ce jour-là) ; avec une heure sans date : aujourd'hui.
    case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end;
  v_end_date date;
begin
  perform public.assert_office();

  v_end_date := nullif(p_planned_end_date, v_planned_date);

  if public.normalize_key(p_plate) = '' then
    raise exception 'Indique l''immatriculation' using errcode = '22023';
  end if;
  if coalesce(btrim(p_requested_work), '') = '' then
    raise exception 'Indique la tâche à faire' using errcode = '22023';
  end if;
  if v_end_date < v_planned_date then
    raise exception 'La date de fin doit être après la date de début' using errcode = '22023';
  end if;
  if v_end_date is not null and (p_planned_start is null or p_planned_end is null) then
    raise exception 'Indique les heures de début et de fin' using errcode = '22023';
  end if;
  if p_planned_end is not null and p_planned_start is null then
    raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
  end if;
  if v_end_date is null and p_planned_end is not null and p_planned_end <= p_planned_start then
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
    planned_date, planned_start, planned_end, planned_end_date,
    customer_signature_file_id, created_by, inspection_required)
  values (
    v_vehicle.id, coalesce(v_client_id, v_vehicle.client_id), p_vehicle_type, btrim(p_requested_work), p_mileage,
    p_technician_id,
    v_planned_date, p_planned_start, p_planned_end, v_end_date,
    p_signature_file_id, auth.uid(), coalesce(p_inspection_required, false))
  returning * into v_ro;

  -- Mission : directement dans les travaux effectués
  perform public.add_mission_lines(v_ro.id);
  return v_ro;
end;
$$;

revoke execute on function public.create_repair_order(text, public.vehicle_type, text, text, integer, uuid, date, time, time, uuid, boolean, date)
  from public, anon;
grant execute on function public.create_repair_order(text, public.vehicle_type, text, text, integer, uuid, date, time, time, uuid, boolean, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions existantes reprises telles quelles, avec seulement ces ajouts. Un texte introuvable
-- fait échouer la migration.
--   - rendez-vous converti ou annulé : la date de fin est figée comme le reste ;
--   - OR créé à l'arrivée du véhicule : même créneau que le rendez-vous ;
--   - Agent Direction : une date changée remet le créneau sur une seule journée.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_oid oid;
  v_def text;
  v_new text;
begin
  for r in
    select * from (values
      ('appointments_guard', 'new.end_time,', 'new.end_time, new.end_date,'),
      ('appointments_guard', 'old.end_time,', 'old.end_time, old.end_date,'),
      ('create_repair_order_from_appointment',
       'planned_date, planned_start, planned_end, appointment_id',
       'planned_date, planned_start, planned_end, planned_end_date, appointment_id'),
      ('create_repair_order_from_appointment',
       'v_appt.scheduled_date, v_appt.start_time, v_appt.end_time, v_appt.id',
       'v_appt.scheduled_date, v_appt.start_time, v_appt.end_time, v_appt.end_date, v_appt.id'),
      ('execute_agent_action',
       'set planned_date = (v_payload ->> ''date'')::date,',
       'set planned_date = (v_payload ->> ''date'')::date,' || chr(10) || '             planned_end_date = null,'),
      ('execute_agent_action',
       'set scheduled_date = coalesce((v_payload ->> ''date'')::date, scheduled_date),',
       'set scheduled_date = coalesce((v_payload ->> ''date'')::date, scheduled_date),' || chr(10)
         || '               end_date = case when v_payload ? ''date'' then null else end_date end,')
    ) as t(fn, old_text, new_text)
  loop
    select p.oid into strict v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = r.fn;

    v_def := pg_get_functiondef(v_oid);
    v_new := replace(v_def, r.old_text, r.new_text);
    if v_new = v_def then
      raise exception '% : texte introuvable (%)', r.fn, r.old_text;
    end if;
    execute v_new;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Vues : date de fin ajoutée en dernière colonne
-- ---------------------------------------------------------------------------
create or replace view public.v_repair_orders_overview
with (security_invoker = on) as
 SELECT r.id,
    r.number,
    r.status,
    r.vehicle_id,
    r.client_id,
    r.vehicle_type,
    r.mileage,
    r.requested_work,
    r.technician_id,
    r.planned_date,
    r.planned_start,
    r.planned_end,
    r.customer_signature_file_id,
    r.intervention_type,
    r.roadside_address,
    r.roadside_km,
    r.roadside_travel_hours,
    r.origin_repair_order_id,
    r.origin_quote_id,
    r.appointment_id,
    r.maintenance_contract_id,
    r.assignment_changed_at,
    r.completed_at,
    r.created_by,
    r.legacy_id,
    r.created_at,
    r.updated_at,
    r.pre_quote_work_settled_at,
    r.inspection_required,
    v.plate,
    v.plate_key,
    c.name AS client_name,
    t.display_name AS technician_name,
    t.color AS technician_color,
    tm.worked_seconds,
    tm.running_since,
    ( SELECT count(*) AS count
           FROM public.ro_lines l
          WHERE ((l.repair_order_id = r.id) AND (l.line_type = 'part'::public.line_type) AND (l.order_status <> 'received'::public.part_order_status))) AS parts_pending_count,
    ( SELECT count(*) AS count
           FROM public.ro_lines l
          WHERE ((l.repair_order_id = r.id) AND (l.line_type = 'part'::public.line_type) AND (l.order_status = 'to_order'::public.part_order_status))) AS parts_to_order_count,
    ( SELECT COALESCE(array_agg(lbl.lbl), '{}'::text[]) AS "coalesce"
           FROM unnest(public.required_photo_labels(r.vehicle_type)) lbl(lbl)
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM public.ro_photos p
                  WHERE ((p.repair_order_id = r.id) AND (p.label = lbl.lbl)))))) AS missing_photo_labels,
    ( SELECT COALESCE(sum(l.estimated_hours), (0)::numeric) AS "coalesce"
           FROM public.ro_lines l
          WHERE ((l.repair_order_id = r.id) AND (l.kind = 'done'::public.ro_line_kind))) AS declared_hours,
    (EXISTS ( SELECT 1
           FROM public.quotes q
          WHERE ((q.repair_order_id = r.id) AND (q.status = 'sent'::public.quote_status)))) AS quote_sent,
    r.planned_end_date
   FROM ((((public.repair_orders r
     JOIN public.vehicles v ON ((v.id = r.vehicle_id)))
     LEFT JOIN public.clients c ON ((c.id = r.client_id)))
     LEFT JOIN public.technicians t ON ((t.id = r.technician_id)))
     LEFT JOIN public.v_repair_order_time tm ON ((tm.repair_order_id = r.id)));

drop view public.v_appointments_overview;

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
