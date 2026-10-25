-- =============================================================================
-- Forfaits des pneus jamais vus par le technicien, même sans lien vers leur forfait
--
-- Retour du client : sur un OR créé depuis un devis accepté, le technicien voyait « DÉPOSE/REPOSE
-- PNEUMATIQUE X4 (arrière) », « DÉPOSE/REPOSE ROUE X4 (arrière) », « RECYCLAGE PNEUMATIQUE X4
-- (arrière) » (tâches et résumé) et il manquait « Remplacement Pneus arrière ». Le devis datait
-- d'avant les forfaits en quantité : la suppression des forfaits X4 a vidé le lien de ses lignes,
-- qui ne passaient plus pour des forfaits « devis et facture seulement ».
-- Une ligne de forfait des pneus se reconnaît aussi à sa désignation (avec ou sans X2 / X4, position
-- entre parenthèses) : les lignes sans lien des devis et des OR non facturés sont rattachées au
-- forfait unitaire (désignation et prix gardés), cachées au technicien, avec la tâche « Remplacement
-- Pneus … » de leur position ; le résumé des OR ne les reprend plus. La création d'un OR depuis un
-- devis (et la reprise d'un devis dans un OR) les reconnaît aussi sans lien.
-- =============================================================================

-- Prestation d'une désignation de forfait des pneus (première ligne), sinon null
create function public.tyre_package_kind(p_description text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case substring(trim(split_part(coalesce(p_description, ''), E'\n', 1))
                        from '^(DÉPOSE/REPOSE PNEUMATIQUE|DÉPOSE/REPOSE ROUE|RECYCLAGE PNEUMATIQUE|ÉQUILIBRAGE)(?: X[24])?(?: \([^)]+\))?$')
           when 'DÉPOSE/REPOSE PNEUMATIQUE' then 'pneu'
           when 'DÉPOSE/REPOSE ROUE' then 'roue'
           when 'RECYCLAGE PNEUMATIQUE' then 'recyclage'
           when 'ÉQUILIBRAGE' then 'equilibrage'
         end;
$$;
revoke execute on function public.tyre_package_kind(text) from public, anon;

-- Forfait unitaire des pneus d'une désignation, selon le véhicule (utilitaire, sinon poids lourd)
create function public.tyre_package_for(p_description text, p_vehicle_type public.vehicle_type)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.service_packages p
  where p.legacy_id = 'pneus:' || case when p_vehicle_type = 'vul' then 'vul' else 'pl' end || ':'
                      || public.tyre_package_kind(p_description);
$$;
revoke execute on function public.tyre_package_for(text, public.vehicle_type) from public, anon;

-- OR créé depuis un devis : forfaits des pneus reconnus même sans lien
CREATE OR REPLACE FUNCTION public.create_repair_order_from_quote(p_quote_id uuid, p_technician_id uuid DEFAULT NULL::uuid, p_planned_date date DEFAULT NULL::date, p_planned_start time without time zone DEFAULT NULL::time without time zone, p_planned_end time without time zone DEFAULT NULL::time without time zone, p_inspection_required boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    -- Tâches à faire : main d'œuvre et forfaits ; les pièces restent dans les pièces de l'OR,
    -- les forfaits « devis et facture seulement » ne sont pas des tâches du technicien
    and line_type not in ('text', 'consumable', 'part')
    and not public.package_is_quote_only(coalesce(package_id, public.tyre_package_for(description, v_quote.vehicle_type)));

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
                               source_quote_line_id, visibility)
  select v_ro_id, 'done', ql.position, ql.line_type, ql.description,
         -- Temps réel : saisi par le technicien (exigé avant « Travaux terminés »)
         null,
         ql.standard_hours,
         -- Facturation : le temps du devis accepté, quel que soit le temps réel
         case when ql.line_type in ('labor', 'package')
              then coalesce(ql.billed_hours, ql.standard_hours, ql.estimated_hours) end,
         ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent, coalesce(ql.package_id, public.tyre_package_for(ql.description, v_quote.vehicle_type)),
         ql.id,
         case when public.package_is_quote_only(coalesce(ql.package_id, public.tyre_package_for(ql.description, v_quote.vehicle_type)))
              then 'quote' else 'all' end
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type in ('labor', 'package', 'text');
  -- Forfaits des pneus (devis seulement) : une tâche « Remplacement Pneus … » par position pour le
  -- technicien, avec le barème de la position, non refacturée (les forfaits le sont)
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, standard_hours, labor_category,
                               visibility)
  select v_ro_id, 'done', min(ql.position), 'labor', 'Remplacement Pneus ' || t.pos,
         case when t.pos = 'arrière' and v_quote.vehicle_type <> 'vul' then 1 else 0.5 end,
         min(ql.labor_category::text)::public.labor_category, 'workshop'
  from public.quote_lines ql
  join public.service_packages p
    on p.id = coalesce(ql.package_id, public.tyre_package_for(ql.description, v_quote.vehicle_type)) and p.quote_only and p.trigger_fields && array[
         'pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat', 'pneus.essieu_etat']
  cross join lateral (select substring(split_part(ql.description, E'\n', 1) from '\(([^)]+)\)$') as pos) t
  where ql.quote_id = p_quote_id and ql.section = 'planned' and t.pos is not null
  group by t.pos;
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

-- Devis repris dans un OR : idem
CREATE OR REPLACE FUNCTION public.merge_quote_into_repair_order(p_quote_id uuid, p_repair_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_quote public.quotes;
  v_offset integer;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_quote.repair_order_id is not null or v_quote.merged_into_repair_order_id is not null then
    raise exception 'Seul un devis sans OR peut être rattaché' using errcode = 'P0001';
  end if;

  select coalesce(max(position) + 1, 0) into v_offset
  from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';

  perform set_config('rts.system', 'on', true);
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours,
                               billed_hours, labor_category, unit_price, quantity, discount_percent, package_id, part_id,
                               supplier_id, purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref,
                               order_status, source_quote_line_id, visibility)
  select p_repair_order_id, 'planned', v_offset + ql.position, ql.line_type, ql.description, ql.estimated_hours,
         ql.standard_hours, ql.billed_hours, ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent,
         coalesce(ql.package_id, public.tyre_package_for(ql.description, v_quote.vehicle_type)), ql.part_id, ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand,
         ql.manufacturer_ref, ql.oem_ref,
         case when ql.line_type = 'part' then 'to_order'::public.part_order_status end, ql.id,
         case when public.package_is_quote_only(coalesce(ql.package_id, public.tyre_package_for(ql.description, v_quote.vehicle_type)))
              then 'quote' else 'all' end
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.line_type in ('labor', 'package', 'part', 'text');
  perform set_config('rts.system', '', true);

  update public.quotes set merged_into_repair_order_id = p_repair_order_id where id = p_quote_id;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id, 'Travaux repris depuis le devis ' || coalesce(v_quote.number, 'sans numéro'), auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Lignes déjà enregistrées sans lien : devis, et OR pas encore facturés
-- ---------------------------------------------------------------------------
select set_config('rts.system', 'on', true);

update public.quote_lines ql
   set package_id = public.tyre_package_for(ql.description, q.vehicle_type)
  from public.quotes q
 where q.id = ql.quote_id and ql.package_id is null and ql.line_type = 'package'
   and public.tyre_package_for(ql.description, q.vehicle_type) is not null;

update public.ro_lines l
   set package_id = public.tyre_package_for(l.description, r.vehicle_type), visibility = 'quote'
  from public.repair_orders r
 where r.id = l.repair_order_id and r.status <> 'invoiced' and l.package_id is null
   and l.line_type = 'package' and public.tyre_package_for(l.description, r.vehicle_type) is not null;

-- Tâche « Remplacement Pneus … » du technicien quand elle manque (barème de la position)
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, standard_hours, labor_category,
                             visibility)
select l.repair_order_id, 'done', min(l.position), 'labor', 'Remplacement Pneus ' || t.pos,
       case when t.pos = 'arrière' and r.vehicle_type <> 'vul' then 1 else 0.5 end,
       min(l.labor_category::text)::public.labor_category, 'workshop'
from public.ro_lines l
join public.repair_orders r on r.id = l.repair_order_id and r.status <> 'invoiced'
join public.service_packages p on p.id = l.package_id and p.quote_only and p.trigger_fields && array[
       'pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat', 'pneus.essieu_etat']
cross join lateral (select substring(split_part(l.description, E'\n', 1) from '\(([^)]+)\)$') as pos) t
where l.kind = 'done' and t.pos is not null
  and not exists (select 1 from public.ro_lines w
                  where w.repair_order_id = l.repair_order_id and w.description = 'Remplacement Pneus ' || t.pos)
group by l.repair_order_id, t.pos, r.vehicle_type;

-- Résumé des travaux de l'OR : sans les forfaits des pneus
with cleaned as (
  select r.id,
         string_agg(w.line, E'\n' order by w.n) filter (where public.tyre_package_kind(w.line) is null) as work
  from public.repair_orders r
  cross join lateral unnest(string_to_array(r.requested_work, E'\n')) with ordinality as w(line, n)
  where r.status <> 'invoiced'
  group by r.id
  having bool_or(public.tyre_package_kind(w.line) is not null)
)
update public.repair_orders r
   set requested_work = coalesce(nullif(c.work, ''),
                                 'Travaux issus du devis ' || coalesce((select q.number from public.quotes q
                                                                        where q.id = r.origin_quote_id), ''))
  from cleaned c
 where c.id = r.id;

select set_config('rts.system', '', true);
