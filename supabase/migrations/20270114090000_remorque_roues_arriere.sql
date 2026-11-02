-- Remorque : tous les essieux prennent les forfaits de l'arrière d'un poids lourd (plaquettes, disques et
-- plaquettes, pneus) ; l'essieu 1 prenait ceux de l'avant. Le technicien indique un essieu à 4 roues
-- (jumelées) : ses forfaits des pneus passent à 4 au lieu de 2, aussi quand ils sont déjà prévus.

CREATE OR REPLACE FUNCTION public.sync_trailer_axle_work(p_repair_order_id uuid, p_axles jsonb, p_old_axles jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ro public.repair_orders;
  v_tyre_fields constant text[] := array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat',
                                         'pneus.essieu_etat'];
  v_axle record;
  v_side text;
  v_wheels integer;
  v_activated text[];
  v_covered text[];
  v_fields text[];
  v_pkg record;
  v_part record;
  v_old jsonb;
  v_key text;
  v_desc text;
  v_next_pos integer;
  -- Forfaits voulus : (forfait, libellé, quantité, temps, prix, devis seulement, essieu)
  v_wanted jsonb := '[]'::jsonb;
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    return;
  end if;

  for v_axle in
    select e.item, e.ord::integer as n
    from jsonb_array_elements(coalesce(p_axles, '[]'::jsonb)) with ordinality as e(item, ord)
  loop
    continue when not public.inspection_axle_filled(v_axle.item);
    -- Tous les essieux : forfaits de l'arrière d'un poids lourd ; 4 roues (jumelées) ou 2
    v_side := 'arriere';
    v_wheels := case when v_axle.item ->> 'roues' = '4' then 4 else 2 end;
    v_old := coalesce(p_old_axles -> (v_axle.n - 1), '{}'::jsonb);

    -- Freins : forfaits de l'essieu (disques d'abord, ils comprennent les plaquettes)
    v_activated := array(
      select f || '_' || v_side from unnest(array['disques', 'plaquettes']) f
      where v_axle.item ->> f in ('HS', '50'));
    v_covered := '{}'::text[];
    for v_pkg in
      select p.id, p.name, p.details, p.standard_hours, p.price, p.quote_only, p.trigger_fields,
             (select count(*) from unnest(p.trigger_fields) t where t = any (v_activated)) as overlap
      from public.service_packages p
      where p.is_active
        and cardinality(p.trigger_fields) > 0
        and not (p.trigger_fields && v_tyre_fields)
        and p.trigger_fields && v_activated
        and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
      order by (select count(*) from unnest(p.trigger_fields) t
                where t like 'disques\_%' and t = any (v_activated)) desc,
               8 desc, cardinality(p.trigger_fields), p.name
    loop
      select array_agg(t) into v_fields from unnest(v_pkg.trigger_fields) t where t = any (v_activated);
      if exists (select 1 from unnest(v_fields) t where not (t = any (v_covered))) then
        v_wanted := v_wanted || jsonb_build_object(
          'package_id', v_pkg.id,
          'description', public.trailer_axle_label(v_pkg.name, v_axle.n) || coalesce(E'\n' || nullif(v_pkg.details, ''), ''),
          'quantity', 1, 'hours', v_pkg.standard_hours, 'price', v_pkg.price, 'quote_only', v_pkg.quote_only,
          'ord', v_axle.n);
        v_covered := v_covered || v_fields
          || coalesce((select array_agg(replace(t, 'disques_', 'plaquettes_'))
                       from unnest(v_fields) t where t like 'disques\_%'), '{}');
      end if;
    end loop;

    -- Freins sans forfait : ligne « Remplacement … essieu N » quand l'état vient de changer
    for v_part in select * from (values ('disques', 'Disques de frein'), ('plaquettes', 'Plaquettes')) as f(key, label)
    loop
      continue when coalesce(v_axle.item ->> v_part.key, '') not in ('HS', '50');
      continue when (v_old ->> v_part.key) is not distinct from (v_axle.item ->> v_part.key);
      v_key := v_part.key || '_' || v_side;
      continue when v_key = any (v_covered);
      v_desc := 'Remplacement ' || v_part.label || ' essieu ' || v_axle.n;
      if not exists (select 1 from public.ro_lines
                     where repair_order_id = p_repair_order_id and kind = 'planned' and description = v_desc) then
        select coalesce(max(position) + 1, 0) into v_next_pos
        from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';
        insert into public.ro_lines (repair_order_id, kind, position, line_type, description, visibility)
        values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc, 'all');
      end if;
    end loop;

    -- Pneus à 50 % ou HS : forfaits des pneus (2 par essieu, sans équilibrage) et ligne du technicien
    if v_axle.item ->> 'pneus_etat' in ('HS', '50') then
      v_wanted := v_wanted || coalesce((
        select jsonb_agg(jsonb_build_object(
                 'package_id', p.id,
                 'description', p.name || ' (essieu ' || v_axle.n || ')' || coalesce(E'\n' || nullif(p.details, ''), ''),
                 'quantity', v_wheels, 'hours', p.standard_hours, 'price', p.price, 'quote_only', p.quote_only,
                 'ord', v_axle.n))
        from public.service_packages p
        where p.is_active
          and ('pneus.' || v_side || '_etat') = any (p.trigger_fields)
          and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
          and p.legacy_id is distinct from 'pneus:pl:equilibrage'), '[]'::jsonb);
      if coalesce(v_old ->> 'roues', '2') is distinct from coalesce(v_axle.item ->> 'roues', '2') then
        update public.ro_lines l set quantity = v_wheels
        from public.service_packages p
        where l.repair_order_id = p_repair_order_id and l.kind = 'planned' and l.line_type = 'package'
          and l.package_id = p.id and p.trigger_fields && v_tyre_fields
          and l.description like '% (essieu ' || v_axle.n || ')%';
      end if;
      if (v_old ->> 'pneus_etat') is distinct from (v_axle.item ->> 'pneus_etat') then
        v_desc := 'Remplacement Pneus essieu ' || v_axle.n;
        if not exists (select 1 from public.ro_lines
                       where repair_order_id = p_repair_order_id and kind = 'planned' and description = v_desc) then
          select coalesce(max(position) + 1, 0) into v_next_pos
          from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';
          insert into public.ro_lines (repair_order_id, kind, position, line_type, description, standard_hours, visibility)
          values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc, 0.5,
                  case when exists (select 1 from public.service_packages p
                                    where p.is_active and p.quote_only
                                      and ('pneus.' || v_side || '_etat') = any (p.trigger_fields)
                                      and public.package_fits_vehicle(p.category, v_ro.vehicle_type))
                       then 'workshop' else 'all' end);
        end if;
      end if;
    end if;
  end loop;

  -- Forfaits des essieux plus voulus : retirés ; nouveaux : ajoutés (dans l'ordre des essieux)
  delete from public.ro_lines l
  using public.service_packages p
  where l.repair_order_id = p_repair_order_id
    and l.kind = 'planned'
    and l.line_type = 'package'
    and l.package_id = p.id
    and cardinality(p.trigger_fields) > 0
    and l.description ~ 'essieu [0-9]+'
    and not exists (select 1 from jsonb_array_elements(v_wanted) w
                    where (w ->> 'package_id')::uuid = l.package_id and w ->> 'description' = l.description);

  insert into public.ro_lines (repair_order_id, kind, position, line_type, description,
                               standard_hours, labor_category, unit_price, quantity, package_id, visibility)
  select p_repair_order_id, 'planned',
         (select coalesce(max(position) + 1, 0) from public.ro_lines
          where repair_order_id = p_repair_order_id and kind = 'planned')
           + (row_number() over (order by (w ->> 'ord')::integer, w ->> 'description'))::integer - 1,
         'package', w ->> 'description', (w ->> 'hours')::numeric, v_ro.vehicle_type::text::public.labor_category,
         (w ->> 'price')::numeric, (w ->> 'quantity')::numeric, (w ->> 'package_id')::uuid,
         case when (w ->> 'quote_only')::boolean then 'quote' else 'all' end
  from jsonb_array_elements(v_wanted) w
  where not exists (
    select 1 from public.ro_lines l
    where l.repair_order_id = p_repair_order_id and l.kind = 'planned'
      and l.package_id = (w ->> 'package_id')::uuid and l.description = w ->> 'description');
end;
$function$;
