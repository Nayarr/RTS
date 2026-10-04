-- =============================================================================
-- RTS Atelier : Forfaits
--   Les forfaits se gèrent désormais depuis l'appli (Stock > Forfaits) et peuvent
--   être retirés (archivés). Correctif : une case de la fiche de contrôle passée
--   en HS / 50 % n'est « couverte » que par un forfait actif et adapté au type de
--   véhicule ; sinon la ligne « Remplacement … » est bien proposée.
-- =============================================================================

create or replace function public.sync_inspection_work(p_repair_order_id uuid, p_old jsonb, p_new jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_activated text[];
  v_selected uuid[] := '{}'::uuid[];
  v_covered text[] := '{}'::text[];
  v_fields text[];
  v_pkg record;
  v_field record;
  v_path text[];
  v_desc text;
  v_next_pos integer;
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    return;
  end if;

  perform set_config('rts.system', 'on', true);

  -- 1) Forfaits liés aux cases d'usure HS / 50 % : couverture gloutonne
  --    (le forfait qui couvre le plus de cases d'abord, à égalité le plus ciblé).
  select coalesce(array_agg(f), '{}') into v_activated
  from unnest(public.inspection_wear_fields()) as f
  where p_new #>> array['usure', f] in ('HS', '50');

  for v_pkg in
    select p.id,
           p.trigger_fields,
           (select count(*) from unnest(p.trigger_fields) t where t = any (v_activated)) as overlap
    from public.service_packages p
    where p.is_active
      and cardinality(p.trigger_fields) > 0
      and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
    order by 3 desc, cardinality(p.trigger_fields), p.name
  loop
    exit when v_pkg.overlap = 0;
    select array_agg(t) into v_fields from unnest(v_pkg.trigger_fields) t where t = any (v_activated);
    if exists (select 1 from unnest(v_fields) t where not (t = any (v_covered))) then
      v_selected := v_selected || v_pkg.id;
      v_covered := v_covered || v_fields;
    end if;
  end loop;

  delete from public.ro_lines l
  using public.service_packages p
  where l.repair_order_id = p_repair_order_id
    and l.kind = 'planned'
    and l.line_type = 'package'
    and l.package_id = p.id
    and cardinality(p.trigger_fields) > 0
    and not (p.id = any (v_selected));

  select coalesce(max(position) + 1, 0) into v_next_pos
  from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';

  insert into public.ro_lines (repair_order_id, kind, position, line_type, description,
                               standard_hours, labor_category, unit_price, package_id)
  select p_repair_order_id, 'planned', v_next_pos + (row_number() over (order by p.name))::integer - 1, 'package',
         p.name || coalesce(E'\n' || nullif(p.details, ''), ''),
         p.standard_hours, v_ro.vehicle_type::text::public.labor_category, p.price, p.id
  from public.service_packages p
  where p.id = any (v_selected)
    and not exists (
      select 1 from public.ro_lines l
      where l.repair_order_id = p_repair_order_id and l.kind = 'planned' and l.package_id = p.id);

  -- 2) Case passée en HS / 50 % sans forfait associé : ligne « Remplacement … » à prévoir.
  for v_field in
    select * from (values
      ('usure.plaquettes_avant',    'Plaquettes avant',             null::numeric),
      ('usure.plaquettes_arriere',  'Plaquettes arrière',           null),
      ('usure.disques_avant',       'Disques de frein avant',       null),
      ('usure.disques_arriere',     'Disques de frein arrière',     null),
      ('usure.barre_accouplement',  'Barre d''accouplement',        2),
      ('usure.barre_direction',     'Barre de direction',           2),
      ('usure.kit_accessoires',     'Kit accessoires',              3),
      ('pneus.avant_etat',          'Pneus avant',                  null),
      ('pneus.arriere_etat',        'Pneus arrière',                null),
      ('controles.etiquettes',      'Étiquettes angles morts',      0.5),
      ('controles.hayon',           'Étiquette contrôle hayon',     null),
      ('controles.extincteur1',     'Extincteur 1 kg cabine',       0.3),
      ('controles.extincteur2',     'Extincteur 2 kg cabine',       0.3),
      ('controles.extincteur6',     'Extincteur 6 kg camion',       0.3),
      ('controles.eclairage',       'Éclairage, ampoules',         null)
    ) as f(key, label, hours)
  loop
    v_path := string_to_array(v_field.key, '.');
    continue when (p_new #>> v_path) is null or (p_new #>> v_path) not in ('HS', '50');
    continue when (p_old #>> v_path) is not distinct from (p_new #>> v_path);
    -- Case couverte par un forfait actif adapté au véhicule : le forfait remplace la ligne « Remplacement … ».
    continue when v_path[1] = 'usure'
              and exists (select 1 from public.service_packages p
                          where p.is_active and v_path[2] = any (p.trigger_fields)
                            and public.package_fits_vehicle(p.category, v_ro.vehicle_type));

    v_desc := case when v_field.key = 'controles.eclairage' then 'Mise aux normes éclairage'
                   else 'Remplacement ' || v_field.label end;

    if not exists (select 1 from public.ro_lines
                   where repair_order_id = p_repair_order_id and kind = 'planned' and description = v_desc) then
      select coalesce(max(position) + 1, 0) into v_next_pos
      from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';

      insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours)
      values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc, v_field.hours, v_field.hours);
    end if;
  end loop;

  perform set_config('rts.system', '', true);
end;
$$;

