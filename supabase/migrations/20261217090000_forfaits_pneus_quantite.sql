-- =============================================================================
-- Forfaits des pneus : une ligne par prestation, en quantité, au prix unitaire
--
-- Retour du client : au devis et à la facture, « DÉPOSE/REPOSE PNEUMATIQUE » en quantité 2 à 18 €
-- l'unité (et non un forfait « X2 » à 36 €) ; de même pour la dépose/repose des roues, le recyclage
-- et l'équilibrage. Les forfaits X2 deviennent le forfait unitaire (prix divisé par deux : les prix
-- réglés dans Stock › Forfaits sont gardés) et servent à toutes les positions ; les forfaits X4
-- disparaissent. La fiche de contrôle met la quantité : 2 pour l'avant, le milieu ou un essieu
-- ajouté, 4 pour l'arrière. Les lignes « Remplacement Pneus … » du technicien restent hors du devis
-- et de la facture.
-- =============================================================================

update public.service_packages
   set name = case split_part(legacy_id, ':', 3)
                when 'roue-x2' then 'DÉPOSE/REPOSE ROUE'
                when 'pneu-x2' then 'DÉPOSE/REPOSE PNEUMATIQUE'
                when 'recyclage-x2' then 'RECYCLAGE PNEUMATIQUE'
              end,
       price = round(price / 2, 2),
       trigger_fields = array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat', 'pneus.essieu_etat'],
       legacy_id = replace(legacy_id, '-x2', '')
 where legacy_id like 'pneus:%:roue-x2' or legacy_id like 'pneus:%:pneu-x2' or legacy_id like 'pneus:%:recyclage-x2';

update public.service_packages
   set name = 'ÉQUILIBRAGE', price = round(price / 2, 2), legacy_id = 'pneus:pl:equilibrage'
 where legacy_id = 'pneus:pl:equilibrage-x2';

-- Lignes déjà faites ou facturées : elles gardent leur désignation et leur prix
delete from public.service_packages where legacy_id like 'pneus:%:%-x4';

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
  -- Cases des pneus : forfaits tous ajoutés (roue, pneumatique, recyclage), un lot par essieu
  v_tyre_fields constant text[] := array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat',
                                         'pneus.essieu_etat'];
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
    and not (p.id = any (v_selected));

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

  perform set_config('rts.system', '', true);
end;
$$;
