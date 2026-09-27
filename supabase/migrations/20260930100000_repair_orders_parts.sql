-- =============================================================================
-- RTS Atelier — Pièces, sous-traitance et consommables sur la fiche OR (bureau)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- OR facturé : pièces, sous-traitance, consommables et travaux figés
-- ---------------------------------------------------------------------------

create or replace function public.repair_order_billing_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro_id uuid := case when tg_op = 'DELETE' then old.repair_order_id else new.repair_order_id end;
begin
  if not public.is_system_context()
     and (exists (select 1 from public.repair_orders where id = v_ro_id and status = 'invoiced')
          or (tg_op = 'UPDATE' and exists (select 1 from public.repair_orders
                                           where id = old.repair_order_id and status = 'invoiced'))) then
    raise exception 'OR facturé : il ne peut plus être modifié (passer par un avoir)' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.repair_order_billing_lock() from public, anon, authenticated;

create trigger ro_lines_billing_lock
  before insert or update or delete on public.ro_lines
  for each row execute function public.repair_order_billing_lock();
create trigger subcontracts_billing_lock
  before insert or update or delete on public.subcontracts
  for each row execute function public.repair_order_billing_lock();
create trigger ro_consumables_billing_lock
  before insert or update or delete on public.ro_consumables
  for each row execute function public.repair_order_billing_lock();

-- ---------------------------------------------------------------------------
-- Suivi de commande des pièces dans l'historique de l'OR
-- ---------------------------------------------------------------------------

create or replace function public.ro_lines_log_part_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.line_type = 'part' and new.order_status is distinct from old.order_status and new.order_status is not null then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (new.repair_order_id,
            case new.order_status
              when 'ordered' then 'Pièce commandée : '
              when 'received' then 'Pièce reçue : '
              else 'Pièce à commander : '
            end || split_part(new.description, chr(10), 1),
            auth.uid());
  end if;
  return null;
end;
$$;

revoke execute on function public.ro_lines_log_part_order() from public, anon, authenticated;

create trigger ro_lines_log_part_order
  after update of order_status on public.ro_lines
  for each row execute function public.ro_lines_log_part_order();

-- ---------------------------------------------------------------------------
-- Facture : une pièce saisie dans les travaux effectués n'est facturée qu'une fois
-- (dans le bloc « Pièces »), plus dans la main d'œuvre.
-- ---------------------------------------------------------------------------

-- Brouillon de facture pré-rempli à partir d'un ou plusieurs OR du même client :
-- travaux effectués, pièces, sous-traitance, déplacement, consommables.
create or replace function public.build_invoice_draft(p_repair_order_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_count integer;
  v_client_id uuid;
  v_invoice_id uuid;
  v_ro record;
  v_settings public.app_settings;
  v_vat numeric;
  v_rate numeric;
  v_discount numeric;
  v_grouped boolean := cardinality(p_repair_order_ids) > 1;
  v_base integer;
begin
  perform public.assert_office();

  if p_repair_order_ids is null or cardinality(p_repair_order_ids) = 0 then
    raise exception 'Aucun OR sélectionné' using errcode = '22023';
  end if;
  if (select count(*) from public.repair_orders where id = any (p_repair_order_ids)) <> cardinality(p_repair_order_ids) then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;

  select count(distinct client_id), min(client_id::text)::uuid into v_client_count, v_client_id
  from public.repair_orders where id = any (p_repair_order_ids);
  if exists (select 1 from public.repair_orders where id = any (p_repair_order_ids) and client_id is null) then
    raise exception 'Renseigne le client de l''OR avant de facturer' using errcode = 'P0001';
  end if;
  if v_client_count <> 1 then
    raise exception 'Les OR d''une facture groupée doivent appartenir au même client' using errcode = 'P0001';
  end if;

  -- Un brouillon existe déjà pour cet OR seul : on le reprend.
  if not v_grouped then
    select i.id into v_invoice_id
    from public.invoices i
    join public.invoice_repair_orders iro on iro.invoice_id = i.id
    where i.status = 'draft' and iro.repair_order_id = p_repair_order_ids[1]
      and (select count(*) from public.invoice_repair_orders x where x.invoice_id = i.id) = 1
    limit 1;
    if v_invoice_id is not null then
      return v_invoice_id;
    end if;
  end if;

  for v_ro in select id from public.repair_orders where id = any (p_repair_order_ids) loop
    perform public.apply_package_keywords(v_ro.id);
  end loop;

  select * into v_settings from public.app_settings;
  select default_vat_rate into v_vat from public.company_settings;
  select coalesce(discount_percent, 0) into v_discount from public.clients where id = v_client_id;

  insert into public.invoices (client_id, vehicle_label, mileage)
  select v_client_id,
         case when v_grouped then 'Plusieurs véhicules (' || cardinality(p_repair_order_ids) || ')' else v.plate end,
         case when v_grouped then null else r.mileage end
  from public.repair_orders r join public.vehicles v on v.id = r.vehicle_id
  where r.id = p_repair_order_ids[1]
  returning id into v_invoice_id;

  insert into public.invoice_repair_orders (invoice_id, repair_order_id)
  select v_invoice_id, unnest(p_repair_order_ids);

  for v_ro in
    select r.*, v.plate, t.ord
    from unnest(p_repair_order_ids) with ordinality as t(id, ord)
    join public.repair_orders r on r.id = t.id
    join public.vehicles v on v.id = r.vehicle_id
    order by t.ord
  loop
    v_base := (v_ro.ord::integer - 1) * 10000;
    v_rate := public.labor_rate_for(v_client_id, v_ro.vehicle_type);

    -- En-tête de l'OR (facture groupée)
    if v_grouped then
      insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description)
      values (v_invoice_id, v_ro.id, v_base, 'text',
              v_ro.number || ' — ' || v_ro.plate || coalesce(' — ' || v_ro.mileage || ' km', ''));
    end if;

    -- Travaux effectués
    insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity,
                                      discount_percent, vat_rate, labor_category, standard_hours, billed_hours, package_id,
                                      source_ro_line_id)
    select v_invoice_id, v_ro.id, v_base + 100 + l.position, l.line_type, l.description,
           case
             when l.line_type = 'package' then l.unit_price
             when l.line_type = 'labor' and h.hours is not null then coalesce(l.unit_price, v_rate)
             else l.unit_price
           end,
           case when l.line_type = 'labor' and h.hours is not null then h.hours else l.quantity end,
           case when l.line_type = 'text' then 0 else greatest(l.discount_percent, v_discount) end,
           v_vat,
           case when l.line_type in ('labor', 'package') then coalesce(l.labor_category, v_ro.vehicle_type::text::public.labor_category) end,
           l.standard_hours, coalesce(l.billed_hours, h.hours), l.package_id, l.id
    from public.ro_lines l
    cross join lateral (
      select coalesce(nullif(l.billed_hours, 0), nullif(l.standard_hours, 0), nullif(l.estimated_hours, 0)) as hours
    ) h
    where l.repair_order_id = v_ro.id and l.kind = 'done' and l.line_type <> 'part'
      and (btrim(l.description) <> '' or l.unit_price is not null);

    -- Pièces de l'OR
    insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity,
                                      discount_percent, vat_rate, part_id, supplier_id, purchase_price, shipping_cost,
                                      brand, manufacturer_ref, oem_ref, source_ro_line_id)
    select v_invoice_id, v_ro.id, v_base + 3000 + l.position, 'part', l.description, l.unit_price, l.quantity,
           greatest(l.discount_percent, v_discount), v_vat, l.part_id, l.supplier_id, l.purchase_price, l.shipping_cost,
           l.brand, l.manufacturer_ref, l.oem_ref, l.id
    from public.ro_lines l
    where l.repair_order_id = v_ro.id and l.line_type = 'part';

    -- Sous-traitance refacturée
    insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity,
                                      discount_percent, vat_rate, supplier_id, purchase_price, source_subcontract_id)
    select v_invoice_id, v_ro.id, v_base + 5000 + (row_number() over (order by s.sent_on, s.created_at))::integer,
           'subcontract', 'Sous-traitance : ' || s.service, s.resale_price_ht, 1, v_discount, v_vat,
           s.supplier_id, s.cost_ht, s.id
    from public.subcontracts s
    where s.repair_order_id = v_ro.id;

    -- Déplacement (intervention extérieure / dépannage)
    if v_ro.intervention_type = 'roadside' then
      if v_settings.roadside_flat_fee > 0 then
        insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity, discount_percent, vat_rate)
        values (v_invoice_id, v_ro.id, v_base + 7000, 'travel',
                'Forfait de déplacement' || coalesce(' — ' || nullif(v_ro.roadside_address, ''), ''),
                v_settings.roadside_flat_fee, 1, v_discount, v_vat);
      end if;
      if coalesce(v_ro.roadside_km, 0) > 0 then
        insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity, discount_percent, vat_rate)
        values (v_invoice_id, v_ro.id, v_base + 7001, 'travel',
                'Frais kilométriques (' || v_ro.roadside_km || ' km)', v_settings.roadside_price_per_km, v_ro.roadside_km, v_discount, v_vat);
      end if;
      if coalesce(v_ro.roadside_travel_hours, 0) > 0 then
        insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity, discount_percent, vat_rate)
        values (v_invoice_id, v_ro.id, v_base + 7002, 'travel', 'Temps de trajet',
                v_settings.roadside_travel_hourly_rate, v_ro.roadside_travel_hours, v_discount, v_vat);
      end if;
    end if;

    -- Consommables
    insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity,
                                      discount_percent, vat_rate, purchase_price, source_ro_consumable_id)
    select v_invoice_id, v_ro.id, v_base + 8000 + (row_number() over (order by c.created_at))::integer,
           'consumable', k.name || ' (' || c.quantity || ' ' || c.unit || ')', c.unit_sale_price, c.quantity,
           v_discount, v_vat, c.unit_purchase_price, c.id
    from public.ro_consumables c
    join public.consumables k on k.id = c.consumable_id
    where c.repair_order_id = v_ro.id;
  end loop;

  return v_invoice_id;
end;
$$;
