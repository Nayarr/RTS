-- =============================================================================
-- Saisie des OR
--
-- 1. Kilométrage facultatif : le technicien peut démarrer le badgeage sans l'avoir saisi
--    (les photos obligatoires restent exigées).
-- 2. Devis et factures : les heures de main d'œuvre sont arrondies à l'heure supérieure
--    (1,5 h sur l'OR → 2 h facturées). Les forfaits gardent leur prix.
-- 3. OR créé depuis un devis : « Fournitures et recyclage » n'apparaît plus dans les travaux.
-- 4. « Contrôle hayon » dans les réparations à prévoir : 0,5 h par défaut.
-- =============================================================================

create or replace function public.start_timer(p_repair_order_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_tech uuid := public.current_technician_id();
  v_missing text[];
  v_entry public.time_entries;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  if v_tech is null or v_ro.technician_id is distinct from v_tech then
    raise exception 'Seul le technicien assigné peut démarrer le badgeage' using errcode = '42501';
  end if;

  select coalesce(array_agg(l), '{}') into v_missing
  from unnest(public.required_photo_labels(v_ro.vehicle_type)) as l
  where not exists (select 1 from public.ro_photos p where p.repair_order_id = p_repair_order_id and p.label = l);
  if cardinality(v_missing) > 0 then
    raise exception 'Photos manquantes avant de démarrer : %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;

  if exists (select 1 from public.time_entries where repair_order_id = p_repair_order_id and ended_at is null) then
    raise exception 'Le badgeage est déjà en cours' using errcode = 'P0001';
  end if;

  insert into public.time_entries (repair_order_id, technician_id)
  values (p_repair_order_id, v_tech)
  returning * into v_entry;

  update public.repair_orders set status = 'in_progress' where id = p_repair_order_id and status = 'assigned';
  insert into public.ro_events (repair_order_id, label, actor_id) values (p_repair_order_id, 'Badgeage démarré', auth.uid());
  return v_entry;
end;
$$;

-- Main d'œuvre au devis et à la facture : heure entamée, heure facturée.
create function public.round_labor_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.line_type = 'labor' then
    new.quantity := ceil(new.quantity);
  end if;
  return new;
end;
$$;

create trigger quote_lines_round_hours
  before insert or update of quantity, line_type on public.quote_lines
  for each row execute function public.round_labor_hours();
create trigger invoice_lines_round_hours
  before insert or update of quantity, line_type on public.invoice_lines
  for each row execute function public.round_labor_hours();

-- 3. Récapitulatif des travaux d'un OR créé depuis un devis : sans « Fournitures et recyclage »
--    ni consommables (ce ne sont pas des travaux à faire ; ils restent facturés).
create or replace function public.create_repair_order_from_quote(
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
  from public.quote_lines where quote_id = p_quote_id and section = 'planned'
    and line_type not in ('text', 'consumable');

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
           'Devis accepté · nouvel OR ' || r.number || ' créé', auth.uid()
    from public.repair_orders r where r.id = v_ro_id;
  end if;
  return v_ro_id;
end;
$$;

-- OR déjà créés : la ligne est retirée du récapitulatif.
update public.repair_orders
   set requested_work = btrim(regexp_replace(requested_work, '(^|\n)Fournitures et recyclage(?=\n|$)', '', 'g'), E'\n')
 where status <> 'invoiced' and requested_work ~ '(^|\n)Fournitures et recyclage(\n|$)';

-- 4. « Contrôle hayon » ajouté aux réparations à prévoir : 0,5 h par défaut (modifiable).
create function public.default_tailgate_check_hours()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'planned' and new.estimated_hours is null
     and coalesce(new.description, '') ~* 'contr[ôo]le\s+(du\s+)?hayon' then
    new.estimated_hours := 0.5;
  end if;
  return new;
end;
$$;

create trigger ro_lines_tailgate_check_hours
  before insert or update of description on public.ro_lines
  for each row execute function public.default_tailgate_check_hours();

revoke execute on function public.round_labor_hours() from public, anon, authenticated;
revoke execute on function public.default_tailgate_check_hours() from public, anon, authenticated;
