-- OR créé à partir d'un devis :
--   * les réparations à prévoir du devis deviennent les travaux effectués de l'OR, avec le temps
--     estimé au départ ; ce temps est fixé (le technicien ne le modifie pas), sauf pour les
--     étiquettes (contrôle hayon, angles morts) et les extincteurs ;
--   * le technicien peut retirer un travail finalement non fait (noté dans l'historique) ;
--   * le bureau choisit la date et l'heure de début avant que le technicien soit prévenu.

alter table public.ro_lines
  add column estimate_locked boolean not null default false;
comment on column public.ro_lines.estimate_locked is
  'Temps estimé repris du devis accepté : le technicien ne peut pas le modifier.';

-- Travaux dont le temps dépend de ce que le technicien trouve sur le véhicule (nombre d'étiquettes,
-- d'extincteurs…) : leur temps reste modifiable même repris d'un devis.
create or replace function public.quote_time_is_adjustable(p_description text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_description, '') ~* '(extincteur|angles?\s+morts?|[ée]tiquettes?.*hayon|hayon.*[ée]tiquette)';
$$;
revoke execute on function public.quote_time_is_adjustable(text) from public, anon, authenticated;

drop function public.create_repair_order_from_quote(uuid, uuid);

create function public.create_repair_order_from_quote(
  p_quote_id uuid,
  p_technician_id uuid default null,
  p_planned_date date default null,
  p_planned_start time default null,
  p_planned_end time default null
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
                                    origin_repair_order_id, origin_quote_id)
  values (v_quote.vehicle_id, v_quote.client_id, v_quote.vehicle_type, p_technician_id,
          coalesce(nullif(v_summary, ''), 'Travaux issus du devis ' || coalesce(v_quote.number, '')),
          case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end,
          p_planned_start, p_planned_end,
          v_quote.repair_order_id, v_quote.id)
  returning id into v_ro_id;

  perform set_config('rts.system', 'on', true);
  -- Travaux du devis -> travaux effectués, avec le temps estimé au départ (fixé, sauf étiquettes / extincteurs)
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours,
                               billed_hours, labor_category, unit_price, quantity, discount_percent, package_id,
                               estimate_locked, source_quote_line_id)
  select v_ro_id, 'done', ql.position, ql.line_type, ql.description,
         case when ql.line_type in ('labor', 'package')
              then coalesce(ql.estimated_hours, ql.billed_hours, ql.standard_hours) end,
         ql.standard_hours, ql.billed_hours, ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent,
         ql.package_id,
         ql.line_type in ('labor', 'package') and not public.quote_time_is_adjustable(ql.description),
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
           'Devis accepté · nouvel OR ' || r.number || ' créé', auth.uid()
    from public.repair_orders r where r.id = v_ro_id;
  end if;
  return v_ro_id;
end;
$$;
revoke execute on function public.create_repair_order_from_quote(uuid, uuid, date, time, time) from public, anon;
grant execute on function public.create_repair_order_from_quote(uuid, uuid, date, time, time) to authenticated;

-- Technicien : temps fixé par le devis non modifiable ; un travail effectué (forfait compris) peut être
-- retiré s'il n'a finalement pas été fait, et l'historique le note pour le bureau.
create or replace function public.ro_lines_guard_technician()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_changes text[] := array['description', 'estimated_hours', 'estimate_is_minimum', 'position', 'updated_at'];
begin
  if public.is_system_context() or public.is_office() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.line_type not in ('labor', 'text')
       or new.unit_price is not null or new.purchase_price is not null or new.shipping_cost is not null
       or new.discount_percent <> 0 or new.billed_hours is not null or new.order_status is not null
       or new.package_id is not null or new.part_id is not null or new.supplier_id is not null
       or new.estimate_locked then
      raise exception 'Un technicien ne peut ajouter que des lignes de travaux sans prix' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_allowed_changes) is distinct from (to_jsonb(old) - v_allowed_changes) then
      raise exception 'Modification non autorisée pour un technicien' using errcode = '42501';
    end if;
    if old.line_type = 'package' and new.description is distinct from old.description then
      raise exception 'Le libellé d''un forfait ne peut pas être modifié' using errcode = '42501';
    end if;
    if old.estimate_locked
       and (new.estimated_hours is distinct from old.estimated_hours
            or new.estimate_is_minimum is distinct from old.estimate_is_minimum) then
      raise exception 'Temps fixé par le devis accepté : il ne peut pas être modifié' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE : lignes libres, et travaux effectués (forfaits compris) finalement non faits ; jamais les pièces
  if not (old.line_type in ('labor', 'text') or (old.kind = 'done' and old.line_type = 'package')) then
    raise exception 'Cette ligne ne peut pas être supprimée par un technicien' using errcode = '42501';
  end if;
  if old.kind = 'done' and btrim(old.description) <> '' then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (old.repair_order_id, 'Travail retiré par le technicien (non fait) : ' || split_part(old.description, E'\n', 1),
            auth.uid());
  end if;
  return old;
end;
$$;
