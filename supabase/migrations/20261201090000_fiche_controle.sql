-- =============================================================================
-- Fiche de contrôle selon le véhicule, pneus avant / arrière, estimation à l'aveugle
-- =============================================================================
-- - VUL : pas de barre de direction ni d'accouplement ; remorque : pas de kit accessoires non plus.
-- - Pneus avant et arrière, essieux ajoutés numérotés à partir de 3 (le milieu des anciennes
--   fiches reste pris en compte s'il est rempli).
-- - Lignes « Remplacement … » ajoutées sans temps, et chaque tâche à prévoir estimée par le
--   technicien : le barème n'est plus jamais une estimation par défaut.

create or replace function public.inspection_wear_fields_for(p_vehicle_type public.vehicle_type)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array(
    select f from unnest(public.inspection_wear_fields()) as f
    where not (p_vehicle_type in ('vul', 'remorque') and f in ('barre_accouplement', 'barre_direction'))
      and not (p_vehicle_type = 'remorque' and f = 'kit_accessoires'));
$$;
revoke execute on function public.inspection_wear_fields_for(public.vehicle_type) from public, anon;
grant execute on function public.inspection_wear_fields_for(public.vehicle_type) to authenticated;

create or replace function public.inspection_missing_points(p_data jsonb, p_vehicle_type public.vehicle_type)
returns integer
language sql
immutable
set search_path = ''
as $$
  select
    (select count(*) from unnest(public.inspection_wear_fields_for(p_vehicle_type)) as f
      where coalesce(p_data #>> array['usure', f], '') not in ('OK', '50', 'HS'))::integer
  + (select count(*) from unnest(array['avant_etat', 'arriere_etat']) as f
      where coalesce(p_data #>> array['pneus', f], '') not in ('OK', '50', 'HS'))::integer
  + (select count(*) from unnest(array['etiquettes', 'hayon', 'extincteur1', 'extincteur2', 'extincteur6', 'eclairage']) as f
      where coalesce(p_data #>> array['controles', f], '') not in ('OK', 'HS'))::integer;
$$;
revoke execute on function public.inspection_missing_points(jsonb, public.vehicle_type) from public, anon;
grant execute on function public.inspection_missing_points(jsonb, public.vehicle_type) to authenticated;

-- Ancienne signature : poids lourd (tous les éléments)
create or replace function public.inspection_missing_points(p_data jsonb)
returns integer
language sql
immutable
set search_path = ''
as $$
  select public.inspection_missing_points(p_data, 'pl'::public.vehicle_type);
$$;

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

  -- 1) Forfaits liés aux cases de la fiche (usure, pneus, contrôles, voyants…) : couverture
  --    gloutonne (le forfait qui couvre le plus de cases d'abord, à égalité le plus ciblé).
  --    Disques à refaire : le forfait des disques passe en premier et comprend les plaquettes
  --    du même essieu (pas de forfait plaquettes en plus).
  v_activated := public.inspection_activated_fields(p_new);

  for v_pkg in
    select p.id,
           p.trigger_fields,
           (select count(*) from unnest(p.trigger_fields) t where t = any (v_activated)) as overlap
    from public.service_packages p
    where p.is_active
      and cardinality(p.trigger_fields) > 0
      and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
    order by (select count(*) from unnest(p.trigger_fields) t
              where t like 'disques\_%' and t = any (v_activated)) desc,
             3 desc, cardinality(p.trigger_fields), p.name
  loop
    exit when v_pkg.overlap = 0;
    select array_agg(t) into v_fields from unnest(v_pkg.trigger_fields) t where t = any (v_activated);
    if exists (select 1 from unnest(v_fields) t where not (t = any (v_covered))) then
      v_selected := v_selected || v_pkg.id;
      v_covered := v_covered || v_fields
        || coalesce((select array_agg(replace(t, 'disques_', 'plaquettes_'))
                     from unnest(v_fields) t where t like 'disques\_%'), '{}');
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
      ('usure.barre_accouplement',  'Barre d''accouplement',        null),
      ('usure.barre_direction',     'Barre de direction',           null),
      ('usure.kit_accessoires',     'Kit accessoires',              null),
      ('pneus.avant_etat',          'Pneus avant',                  null),
      ('pneus.milieu_etat',         'Pneus milieu',                 null),
      ('pneus.arriere_etat',        'Pneus arrière',                null),
      ('controles.etiquettes',      'Étiquettes angles morts',      null),
      ('controles.hayon',           'Étiquette contrôle hayon',     null),
      ('controles.extincteur1',     'Extincteur 1 kg cabine',       null),
      ('controles.extincteur2',     'Extincteur 2 kg cabine',       null),
      ('controles.extincteur6',     'Extincteur 6 kg camion',       null),
      ('controles.eclairage',       'Éclairage, ampoules',         null)
    ) as f(key, label, hours)
  loop
    v_path := string_to_array(v_field.key, '.');
    continue when (p_new #>> v_path) is null or (p_new #>> v_path) not in ('HS', '50');
    continue when (p_old #>> v_path) is not distinct from (p_new #>> v_path);
    -- Élément sans objet pour ce véhicule (barres sur un VUL, kit sur une remorque)
    continue when v_path[1] = 'usure' and not (v_path[2] = any (public.inspection_wear_fields_for(v_ro.vehicle_type)));
    -- Case couverte par un forfait actif adapté au véhicule : le forfait remplace la ligne « Remplacement … ».
    continue when exists (select 1 from public.service_packages p
                          where p.is_active
                            and (case when v_path[1] = 'usure' then v_path[2] else v_field.key end) = any (p.trigger_fields)
                            and public.package_fits_vehicle(p.category, v_ro.vehicle_type));
    -- Plaquettes d'un essieu dont les disques sont à refaire : comprises dans le forfait des disques.
    continue when v_path[2] like 'plaquettes\_%'
              and replace(v_path[2], 'plaquettes_', 'disques_') = any (v_activated)
              and exists (select 1 from public.service_packages p
                          where p.is_active and replace(v_path[2], 'plaquettes_', 'disques_') = any (p.trigger_fields)
                            and public.package_fits_vehicle(p.category, v_ro.vehicle_type));

    v_desc := case when v_field.key = 'controles.eclairage' then 'Mise aux normes éclairage'
                   else 'Remplacement ' || v_field.label end;

    if not exists (select 1 from public.ro_lines
                   where repair_order_id = p_repair_order_id and kind = 'planned' and description = v_desc) then
      select coalesce(max(position) + 1, 0) into v_next_pos
      from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';

      -- Sans temps : le technicien estime lui-même, à l'aveugle
      insert into public.ro_lines (repair_order_id, kind, position, line_type, description)
      values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc);
    end if;
  end loop;

  -- 3) Essieux ajoutés (pneus.essieux) : pneus à 50 % ou HS → ligne « Remplacement Pneus essieu N ».
  for v_field in
    select (e.ord + 2)::integer as axle, e.item ->> 'etat' as state,
           p_old #>> array['pneus', 'essieux', (e.ord - 1)::text, 'etat'] as old_state
    from jsonb_array_elements(coalesce(p_new #> '{pneus,essieux}', '[]'::jsonb)) with ordinality as e(item, ord)
  loop
    continue when v_field.state is null or v_field.state not in ('HS', '50');
    continue when v_field.old_state is not distinct from v_field.state;
    v_desc := 'Remplacement Pneus essieu ' || v_field.axle;
    if not exists (select 1 from public.ro_lines
                   where repair_order_id = p_repair_order_id and kind = 'planned' and description = v_desc) then
      select coalesce(max(position) + 1, 0) into v_next_pos
      from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';
      insert into public.ro_lines (repair_order_id, kind, position, line_type, description)
      values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc);
    end if;
  end loop;

  perform set_config('rts.system', '', true);
end;
$$;

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
  -- OR facturé : figé, avant même la liste de ce qui manque.
  if v_ro.status = 'invoiced' then
    raise exception 'OR facturé : il ne peut plus être modifié' using errcode = '42501';
  end if;

  select count(*) into v_count from public.ro_lines
  where repair_order_id = p_repair_order_id and kind = 'done'
    and line_type in ('labor', 'package') and estimated_hours is null;
  if v_count > 0 then
    v_missing := v_missing || format('Temps estimé manquant : %s tâche%s des travaux effectués',
                                     v_count, case when v_count > 1 then 's' else '' end);
  end if;

  select count(*) into v_count from public.ro_lines
  where repair_order_id = p_repair_order_id and kind = 'planned'
    -- Chaque tâche à prévoir est estimée par le technicien (le barème reste au bureau)
    and line_type in ('labor', 'package') and estimated_hours is null;
  if v_count > 0 then
    v_missing := v_missing || format('Temps estimé manquant : %s tâche%s à prévoir',
                                     v_count, case when v_count > 1 then 's' else '' end);
  end if;

  select data into v_inspection from public.inspections where repair_order_id = p_repair_order_id;

  if v_ro.inspection_required then
    v_count := public.inspection_missing_points(v_inspection, v_ro.vehicle_type);
    if v_count > 0 then
      v_missing := v_missing || format('Fiche de contrôle complète exigée : %s point%s OK / 50 %% / HS non renseigné%s',
                                       v_count, case when v_count > 1 then 's' else '' end,
                                       case when v_count > 1 then 's' else '' end);
    end if;
  end if;
  for v_side in select * from (values ('avant', 'avant'), ('milieu', 'milieu'), ('arriere', 'arrière')) as s(key, label) loop
    if v_inspection #>> array['pneus', v_side.key || '_etat'] in ('50', 'HS')
       and coalesce(btrim(v_inspection #>> array['pneus', v_side.key || '_taille']), '') = '' then
      v_missing := v_missing || format('Taille des pneus %s obligatoire (%s)', v_side.label,
        case when v_inspection #>> array['pneus', v_side.key || '_etat'] = 'HS' then 'HS' else '50 %' end);
    end if;
  end loop;

  for v_side in
    select e.ord + 2 as axle, e.item ->> 'etat' as state, btrim(coalesce(e.item ->> 'taille', '')) as size
    from jsonb_array_elements(coalesce(v_inspection #> '{pneus,essieux}', '[]'::jsonb)) with ordinality as e(item, ord)
  loop
    if v_side.state in ('50', 'HS') and v_side.size = '' then
      v_missing := v_missing || format('Taille des pneus essieu %s obligatoire (%s)', v_side.axle,
        case when v_side.state = 'HS' then 'HS' else '50 %' end);
    end if;
  end loop;

  -- Photo du contrôle technique : toujours exigée.
  if not exists (select 1 from public.ro_photos
                 where repair_order_id = p_repair_order_id and label = 'Contrôle technique') then
    v_missing := v_missing || 'Photo du contrôle technique obligatoire'::text;
  end if;

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
          'Travaux marqués terminés' || case when p_quote_needed then ' · devis à faire' else '' end,
          auth.uid());
  return v_ro;
end;
$$;

-- « Contrôle hayon » à prévoir : plus de 0,5 h mis d'office, le technicien l'estime comme le reste.
drop trigger ro_lines_tailgate_check_hours on public.ro_lines;
drop function public.default_tailgate_check_hours();
