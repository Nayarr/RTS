-- =============================================================================
-- Dépannage extérieur : lieu d'intervention, trajet aller-retour, déplacement facturé par zone
--
-- Demande du client : à la création de l'OR, « Dépannage extérieur » avec le lieu d'intervention,
-- la distance et le temps de trajet aller-retour (calculés par la carte, trafic compris, ou saisis).
-- Facturation sur la distance aller-retour :
--   zone 1, moins de 10 km : forfait déplacement de proximité 60 € HT ;
--   zone 2, de 10 à 20 km : 90 € HT ; zone 3, de 20 à 40 km : 130 € HT ;
--   au-delà de 40 km : prix saisi à la main.
-- Au-delà du temps de trajet de la zone (zone 1 : 30 min, sans tolérance ; zone 2 : 1 h ; zone 3 :
-- 1 h 30, avec 7 min de tolérance), le temps de trajet est facturé : 1 h au moins, puis à la minute,
-- au taux horaire du trajet (90 € HT). Ex. : zone 1 en 40 min → 90 € ; zone 2 en 1 h 10 → 105 €.
-- Tout se règle dans Réglages › Atelier. Une seule ligne de déplacement sur la facture (remplace
-- le forfait, les frais kilométriques et le temps de trajet séparés).
-- =============================================================================

alter table public.app_settings
  add column roadside_zone2_price numeric(10,2) not null default 90 check (roadside_zone2_price >= 0),
  add column roadside_zone3_price numeric(10,2) not null default 130 check (roadside_zone3_price >= 0),
  add column roadside_zone1_max_km numeric(6,1) not null default 10 check (roadside_zone1_max_km > 0),
  add column roadside_zone2_max_km numeric(6,1) not null default 20,
  add column roadside_zone3_max_km numeric(6,1) not null default 40,
  add column roadside_zone1_max_minutes integer not null default 30 check (roadside_zone1_max_minutes >= 0),
  add column roadside_zone2_max_minutes integer not null default 60 check (roadside_zone2_max_minutes >= 0),
  add column roadside_zone3_max_minutes integer not null default 90 check (roadside_zone3_max_minutes >= 0),
  add column roadside_tolerance_minutes integer not null default 7 check (roadside_tolerance_minutes between 0 and 60),
  add constraint app_settings_roadside_zones_check
    check (roadside_zone1_max_km < roadside_zone2_max_km and roadside_zone2_max_km < roadside_zone3_max_km);
comment on column public.app_settings.roadside_flat_fee is 'Dépannage : forfait déplacement de proximité (zone 1), € HT.';
comment on column public.app_settings.roadside_tolerance_minutes is
  'Dépannage, zones 2 et 3 : minutes de trajet tolérées au-delà du temps de la zone (zone 1 : aucune).';

alter table public.repair_orders
  add column roadside_minutes integer check (roadside_minutes >= 0),
  add column roadside_price_ht numeric(10,2) check (roadside_price_ht >= 0);
comment on column public.repair_orders.roadside_km is 'Dépannage : distance aller-retour depuis l''atelier (km).';
comment on column public.repair_orders.roadside_minutes is 'Dépannage : temps de trajet aller-retour (minutes).';
comment on column public.repair_orders.roadside_price_ht is
  'Dépannage : prix du déplacement saisi à la main (au-delà de la zone 3, ou à la place du calcul), € HT.';

-- « 40 min », « 1 h », « 1 h 20 »
create function public.duration_label(p_minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_minutes < 60 then p_minutes || ' min'
           when p_minutes % 60 = 0 then (p_minutes / 60) || ' h'
           else (p_minutes / 60) || ' h ' || lpad((p_minutes % 60)::text, 2, '0')
         end;
$$;
revoke execute on function public.duration_label(integer) from public, anon;
grant execute on function public.duration_label(integer) to authenticated;

-- Déplacement d'un dépannage : zone (4 : au-delà de la zone 3), prix (null : à saisir) et libellé
create function public.roadside_travel(p_km numeric, p_minutes integer, p_manual_price numeric)
returns table (zone integer, price numeric, label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.app_settings;
  v_zone integer;
  v_forfait numeric;
  v_max integer;
  v_tolerance integer;
  v_minutes integer := coalesce(p_minutes, 0);
begin
  select * into s from public.app_settings;
  v_zone := case
              when coalesce(p_km, 0) < s.roadside_zone1_max_km then 1
              when p_km < s.roadside_zone2_max_km then 2
              when p_km <= s.roadside_zone3_max_km then 3
              else 4
            end;
  zone := v_zone;
  if v_zone = 4 or p_manual_price is not null then
    price := p_manual_price;
    label := case when v_zone = 4
                  then 'Déplacement (' || replace(trim(to_char(p_km, 'FM9990.0')), '.', ',') || ' km aller-retour)'
                  else 'Déplacement zone ' || v_zone end;
    return next;
    return;
  end if;
  v_forfait := case v_zone when 1 then s.roadside_flat_fee when 2 then s.roadside_zone2_price
                           else s.roadside_zone3_price end;
  v_max := case v_zone when 1 then s.roadside_zone1_max_minutes when 2 then s.roadside_zone2_max_minutes
                       else s.roadside_zone3_max_minutes end;
  v_tolerance := case when v_zone = 1 then 0 else s.roadside_tolerance_minutes end;
  if v_minutes > v_max + v_tolerance then
    -- Temps de trajet facturé : 1 h au moins, puis à la minute
    price := round(s.roadside_travel_hourly_rate * greatest(60, v_minutes) / 60.0, 2);
    label := 'Déplacement zone ' || v_zone || ' : ' || public.duration_label(v_minutes) || ' de trajet aller-retour';
  else
    price := v_forfait;
    label := 'Forfait déplacement zone ' || v_zone || case when v_zone = 1 then ' (proximité)' else '' end;
  end if;
  return next;
end;
$$;
revoke execute on function public.roadside_travel(numeric, integer, numeric) from public, anon;
grant execute on function public.roadside_travel(numeric, integer, numeric) to authenticated;

-- Brouillon de facture : la ligne de déplacement du dépannage
CREATE OR REPLACE FUNCTION public.build_invoice_draft(p_repair_order_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_client_count integer;
  v_client_id uuid;
  v_invoice_id uuid;
  v_ro record;
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
              v_ro.number || ' · ' || v_ro.plate || coalesce(' · ' || v_ro.mileage || ' km', ''));
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
      -- Tâche de l'atelier couverte par des forfaits : facturée par les forfaits
      and l.visibility <> 'workshop'
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

    -- Déplacement (dépannage extérieur) : une ligne, prix de la zone ou du temps de trajet
    if v_ro.intervention_type = 'roadside' then
      insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity, discount_percent, vat_rate)
      select v_invoice_id, v_ro.id, v_base + 7000, 'travel',
             t.label || coalesce(' · ' || nullif(v_ro.roadside_address, ''), ''),
             coalesce(t.price, 0), 1, v_discount, v_vat
      from public.roadside_travel(v_ro.roadside_km, v_ro.roadside_minutes, v_ro.roadside_price_ht) t;
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
