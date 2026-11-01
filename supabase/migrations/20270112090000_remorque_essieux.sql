-- Remorques : fiche de contrôle par essieu (3 au départ, ajoutables ou retirables). Chaque essieu
-- a ses disques, plaquettes et pneus ; un essieu laissé vide n'existe pas (fiche complète, alertes,
-- forfaits). Les forfaits restent les mêmes, nommés par essieu : « Disque et plaquette essieu 2 »,
-- « DÉPOSE/REPOSE ROUE (essieu 1) ». Essieu 1 : forfaits de l'avant ; les suivants : de l'arrière.
-- Les camions, utilitaires et anciennes fiches de remorque (avant / arrière) ne changent pas.

-- Essieu rempli : au moins un état ou une taille de pneu.
create function public.inspection_axle_filled(p_axle jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(p_axle ->> 'disques', '') <> '' or coalesce(p_axle ->> 'plaquettes', '') <> ''
      or coalesce(p_axle ->> 'pneus_etat', '') <> '' or btrim(coalesce(p_axle ->> 'pneus_taille', '')) <> '';
$$;

-- Ancienne fiche de remorque remplie (freins ou pneus avant / arrière, essieux ajoutés).
create function public.inspection_legacy_trailer_filled(p_data jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select exists (select 1 from unnest(array['disques_avant', 'disques_arriere', 'plaquettes_avant',
                                            'plaquettes_arriere']) f
                 where coalesce(p_data #>> array['usure', f], '') <> '')
      or exists (select 1 from unnest(array['avant_etat', 'arriere_etat', 'avant_taille', 'arriere_taille']) f
                 where btrim(coalesce(p_data #>> array['pneus', f], '')) <> '')
      or exists (select 1 from jsonb_array_elements(coalesce(p_data #> '{pneus,essieux}', '[]'::jsonb)) e
                 where coalesce(e ->> 'etat', '') <> '' or btrim(coalesce(e ->> 'taille', '')) <> '');
$$;

-- Fiche sans les freins et pneus avant / arrière (remplacés par les essieux de la remorque).
create function public.inspection_without_axle_points(p_data jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select (p_data - 'remorque_essieux')
         || jsonb_build_object('usure', coalesce(p_data -> 'usure', '{}'::jsonb)
                                        - array['disques_avant', 'disques_arriere', 'plaquettes_avant', 'plaquettes_arriere'],
                               'pneus', '{}'::jsonb);
$$;

-- Points OK / 50 % / HS non renseignés. Remorque par essieu (ou fiche pas encore remplie) : disques,
-- plaquettes et pneus des essieux remplis, au moins le premier ; puis les contrôles.
create or replace function public.inspection_missing_points(p_data jsonb, p_vehicle_type public.vehicle_type)
returns integer
language sql
immutable
set search_path to ''
as $$
  select case
    when p_vehicle_type = 'remorque'
         and (jsonb_typeof(p_data -> 'remorque_essieux') = 'array'
              or not public.inspection_legacy_trailer_filled(coalesce(p_data, '{}'::jsonb))) then
      (select count(*)
         from (select e.item
                 from jsonb_array_elements(case when jsonb_typeof(p_data -> 'remorque_essieux') = 'array'
                                                then p_data -> 'remorque_essieux' else '[{}]'::jsonb end)
                      with ordinality as e(item, ord)
                where public.inspection_axle_filled(e.item)
                   or (e.ord = 1 and not exists (
                         select 1 from jsonb_array_elements(p_data -> 'remorque_essieux') a
                         where jsonb_typeof(p_data -> 'remorque_essieux') = 'array'
                           and public.inspection_axle_filled(a)))
              ) axles
         cross join unnest(array['disques', 'plaquettes', 'pneus_etat']) f
        where coalesce(axles.item ->> f, '') not in ('OK', '50', 'HS'))::integer
    else
      (select count(*) from unnest(public.inspection_wear_fields_for(p_vehicle_type)) as f
        where coalesce(p_data #>> array['usure', f], '') not in ('OK', '50', 'HS'))::integer
      + (select count(*) from unnest(array['avant_etat', 'arriere_etat']) as f
        where coalesce(p_data #>> array['pneus', f], '') not in ('OK', '50', 'HS'))::integer
  end
  + (select count(*) from unnest(array['etiquettes', 'hayon', 'extincteur1', 'extincteur2', 'extincteur6', 'eclairage']) as f
      where coalesce(p_data #>> array['controles', f], '') not in ('OK', 'HS'))::integer;
$$;

-- Nom d'un forfait pour un essieu de remorque : « avant » ou « arrière » remplacé par « essieu N »,
-- sinon « essieu N » ajouté.
create function public.trailer_axle_label(p_name text, p_axle integer)
returns text
language sql
immutable
set search_path to ''
as $$
  select case when p_name ~* '\m(avant|arri[eè]re)\M'
              then regexp_replace(p_name, '\m(avant|arri[eè]re)\M', 'essieu ' || p_axle, 'i')
              else p_name || ' essieu ' || p_axle end;
$$;

-- Forfaits et lignes « Remplacement … » des essieux d'une remorque (appelée par sync_inspection_work).
create function public.sync_trailer_axle_work(p_repair_order_id uuid, p_axles jsonb, p_old_axles jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_ro public.repair_orders;
  v_tyre_fields constant text[] := array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat',
                                         'pneus.essieu_etat'];
  v_axle record;
  v_side text;
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
    v_side := case when v_axle.n = 1 then 'avant' else 'arriere' end;
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
                 'quantity', 2, 'hours', p.standard_hours, 'price', p.price, 'quote_only', p.quote_only,
                 'ord', v_axle.n))
        from public.service_packages p
        where p.is_active
          and ('pneus.' || v_side || '_etat') = any (p.trigger_fields)
          and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
          and p.legacy_id is distinct from 'pneus:pl:equilibrage'), '[]'::jsonb);
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
$$;
revoke execute on function public.sync_trailer_axle_work(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.inspection_axle_filled(jsonb) from public, anon;
revoke execute on function public.inspection_legacy_trailer_filled(jsonb) from public, anon;
revoke execute on function public.inspection_without_axle_points(jsonb) from public, anon;
revoke execute on function public.trailer_axle_label(text, integer) from public, anon;
-- Fiche complète calculée aussi pour la personne connectée (inspection_missing_points)
grant execute on function public.inspection_axle_filled(jsonb) to authenticated;
grant execute on function public.inspection_legacy_trailer_filled(jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.sync_inspection_work(p_repair_order_id uuid, p_old jsonb, p_new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Cases des pneus : forfaits tous ajoutés (roue, pneumatique, recyclage), un lot par essieu
  v_tyre_fields constant text[] := array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat',
                                         'pneus.essieu_etat'];
  -- Remorque par essieu : freins et pneus traités essieu par essieu (sync_trailer_axle_work)
  v_trailer boolean;
  v_axles jsonb;
  v_old_axles jsonb;
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    return;
  end if;

  v_trailer := v_ro.vehicle_type = 'remorque' and jsonb_typeof(p_new -> 'remorque_essieux') = 'array';
  if v_trailer then
    v_axles := p_new -> 'remorque_essieux';
    v_old_axles := case when jsonb_typeof(p_old -> 'remorque_essieux') = 'array'
                        then p_old -> 'remorque_essieux' else '[]'::jsonb end;
    -- Freins et pneus avant / arrière d'une ancienne fiche : remplacés par les essieux
    p_new := public.inspection_without_axle_points(p_new);
    p_old := public.inspection_without_axle_points(coalesce(p_old, '{}'::jsonb));
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
      and not (p.trigger_fields && v_tyre_fields)
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
    and not (p.trigger_fields && v_tyre_fields)
    and not (p.id = any (v_selected))
    and not (v_trailer and l.description ~ 'essieu [0-9]+');

  select coalesce(max(position) + 1, 0) into v_next_pos
  from public.ro_lines where repair_order_id = p_repair_order_id and kind = 'planned';

  insert into public.ro_lines (repair_order_id, kind, position, line_type, description,
                               standard_hours, labor_category, unit_price, package_id, visibility)
  select p_repair_order_id, 'planned', v_next_pos + (row_number() over (order by p.name))::integer - 1, 'package',
         p.name || coalesce(E'\n' || nullif(p.details, ''), ''),
         p.standard_hours, v_ro.vehicle_type::text::public.labor_category, p.price, p.id,
         case when p.quote_only then 'quote' else 'all' end
  from public.service_packages p
  where p.id = any (v_selected)
    and not exists (
      select 1 from public.ro_lines l
      where l.repair_order_id = p_repair_order_id and l.kind = 'planned' and l.package_id = p.id);

  -- 1 bis) Pneus à 50 % ou HS : chaque forfait des pneus de la position (avant, milieu, arrière),
  --        et pour chaque essieu ajouté, un lot de forfaits « essieu », repérés par leur position.
  with wanted as (
    select p.id as package_id,
           p.name || ' (' || w.label || ')' || coalesce(E'
' || nullif(p.details, ''), '') as description,
           -- 2 pneus par position, 4 à l'arrière ; dépose/repose des roues : 1 h à l'arrière d'un poids lourd
           case when w.key = 'pneus.arriere_etat' then 4 else 2 end as quantity,
           case when p.legacy_id like 'pneus:%:roue' and w.key = 'pneus.arriere_etat' and v_ro.vehicle_type <> 'vul'
                then 1 else p.standard_hours end as standard_hours,
           p.price, p.name, p.quote_only, w.ord
    from (
      select f.key, f.label, f.ord
      from (values ('pneus.avant_etat', 'avant', 1), ('pneus.milieu_etat', 'milieu', 2),
                   ('pneus.arriere_etat', 'arrière', 3)) as f(key, label, ord)
      where p_new #>> string_to_array(f.key, '.') in ('HS', '50')
      union all
      select 'pneus.essieu_etat', 'essieu ' || (e.ord + 2), 3 + e.ord::integer
      from jsonb_array_elements(coalesce(p_new #> '{pneus,essieux}', '[]'::jsonb)) with ordinality as e(item, ord)
      where e.item ->> 'etat' in ('HS', '50')
    ) w
    join public.service_packages p
      on p.is_active and w.key = any (p.trigger_fields)
         and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
         -- Équilibrage : camion seulement (une remorque prend le tarif PL, pas l'équilibrage)
         and not (p.legacy_id = 'pneus:pl:equilibrage' and v_ro.vehicle_type <> 'pl')
  ),
  removed as (
    delete from public.ro_lines l
    using public.service_packages p
    where l.repair_order_id = p_repair_order_id
      and l.kind = 'planned'
      and l.line_type = 'package'
      and l.package_id = p.id
      and p.trigger_fields && v_tyre_fields
      and not exists (select 1 from wanted w where w.package_id = l.package_id and w.description = l.description)
      and not (v_trailer and l.description ~ 'essieu [0-9]+')
    returning l.id
  )
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description,
                               standard_hours, labor_category, unit_price, quantity, package_id, visibility)
  select p_repair_order_id, 'planned',
         (select coalesce(max(position) + 1, 0) from public.ro_lines
          where repair_order_id = p_repair_order_id and kind = 'planned')
           + (row_number() over (order by w.ord, w.name))::integer - 1,
         'package', w.description, w.standard_hours, v_ro.vehicle_type::text::public.labor_category, w.price,
         w.quantity, w.package_id, case when w.quote_only then 'quote' else 'all' end
  from wanted w
  where not exists (
    select 1 from public.ro_lines l
    where l.repair_order_id = p_repair_order_id and l.kind = 'planned'
      and l.package_id = w.package_id and l.description = w.description);

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
    -- Case couverte par un forfait actif adapté au véhicule : le forfait remplace la ligne « Remplacement … »
    -- (sauf les pneus : le technicien garde sa ligne, les forfaits sont pour le devis).
    continue when not (v_field.key = any (v_tyre_fields)) and exists (select 1 from public.service_packages p
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

      -- Sans temps : le technicien estime lui-même, à l'aveugle. Pneus : barème de la ligne (30 min à
      -- l'avant, 1 h à l'arrière d'un poids lourd) et, si des forfaits des pneus existent, ligne de
      -- l'atelier seulement (le devis reprend les forfaits à la place).
      insert into public.ro_lines (repair_order_id, kind, position, line_type, description, standard_hours, visibility)
      values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc,
              case when v_field.key = 'pneus.arriere_etat' and v_ro.vehicle_type <> 'vul' then 1
                   when v_field.key = any (v_tyre_fields) then 0.5 end,
              case when v_field.key = any (v_tyre_fields) and exists (
                     select 1 from public.service_packages p
                     where p.is_active and p.quote_only and v_field.key = any (p.trigger_fields)
                       and public.package_fits_vehicle(p.category, v_ro.vehicle_type))
                   then 'workshop' else 'all' end);
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
      -- Ligne du technicien (30 min) ; les forfaits de l'essieu sont au devis
      insert into public.ro_lines (repair_order_id, kind, position, line_type, description, standard_hours, visibility)
      values (p_repair_order_id, 'planned', v_next_pos, 'labor', v_desc, 0.5,
              case when exists (select 1 from public.service_packages p
                                where p.is_active and p.quote_only and 'pneus.essieu_etat' = any (p.trigger_fields)
                                  and public.package_fits_vehicle(p.category, v_ro.vehicle_type))
                   then 'workshop' else 'all' end);
    end if;
  end loop;

  if v_trailer then
    perform public.sync_trailer_axle_work(p_repair_order_id, v_axles, v_old_axles);
  end if;

  perform set_config('rts.system', '', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_repair_order(p_repair_order_id uuid, p_quote_needed boolean DEFAULT false)
 RETURNS repair_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where repair_order_id = p_repair_order_id and kind = 'done' and visibility <> 'quote'
    and line_type in ('labor', 'package') and estimated_hours is null;
  if v_count > 0 then
    v_missing := v_missing || format('Temps estimé manquant : %s tâche%s des travaux effectués',
                                     v_count, case when v_count > 1 then 's' else '' end);
  end if;

  select count(*) into v_count from public.ro_lines
  where repair_order_id = p_repair_order_id and kind = 'planned'
    -- Chaque tâche à prévoir est estimée par le technicien (le barème reste au bureau) ;
    -- les forfaits « devis et facture seulement » ne lui sont pas montrés
    and visibility <> 'quote'
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

  -- Remorque par essieu : taille des pneus à 50 % ou HS de chaque essieu
  for v_side in
    select e.ord as axle, e.item ->> 'pneus_etat' as state, btrim(coalesce(e.item ->> 'pneus_taille', '')) as size
    from jsonb_array_elements(case when v_ro.vehicle_type = 'remorque'
                                        and jsonb_typeof(v_inspection -> 'remorque_essieux') = 'array'
                                   then v_inspection -> 'remorque_essieux' else '[]'::jsonb end)
         with ordinality as e(item, ord)
  loop
    if v_side.state in ('50', 'HS') and v_side.size = '' then
      v_missing := v_missing || format('Taille des pneus essieu %s obligatoire (%s)', v_side.axle,
        case when v_side.state = 'HS' then 'HS' else '50 %' end);
    end if;
  end loop;

  -- Photo du contrôle technique : exigée, sauf pour une remorque (facultative).
  if v_ro.vehicle_type <> 'remorque'
     and not exists (select 1 from public.ro_photos
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
$function$;
