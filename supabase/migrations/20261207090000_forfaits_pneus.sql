-- =============================================================================
-- RTS Atelier : forfaits des pneus déclenchés par la fiche de contrôle
--
-- Pneus avant, ou essieu ajouté, à 50 % ou HS : dépose/repose roue x2, dépose/repose
-- pneumatique x2, recyclage pneumatique x2 ; pneus arrière : les mêmes x4. Barème PL (remorque
-- comprise) 18 / 18 / 8 € HT par pneu, VUL 8 / 8 / 4 € HT. Temps de barème à 0 h, à régler
-- dans Stock › Forfaits comme les prix et les libellés.
-- Contrairement aux autres cases de la fiche, une case de pneus déclenche tous ses forfaits, et
-- chaque essieu ajouté son propre lot ; la position est rappelée dans le libellé (« (avant) »).
-- =============================================================================

-- Nouvelle case déclencheuse : chaque essieu ajouté (au-delà de l'avant et de l'arrière)
create or replace function public.inspection_trigger_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select public.inspection_wear_fields() || array[
    'pneus.avant_etat', 'pneus.milieu_etat', 'pneus.arriere_etat', 'pneus.essieu_etat',
    'controles.etiquettes', 'controles.hayon', 'controles.extincteur1', 'controles.extincteur2',
    'controles.extincteur6', 'controles.eclairage',
    'voyants.moteur', 'voyants.echappement', 'voyants.abs', 'voyants.freins',
    'probleme_electrique'];
$$;

-- Forfaits des pneus (rejouable : repérés par leur clé, jamais en double)
insert into public.service_packages (legacy_id, name, category, standard_hours, price, trigger_fields)
select 'pneus:' || c.category || ':' || f.code, f.name, c.category::public.labor_category, 0,
       f.qty * case c.category when 'pl' then f.pl else f.vul end, f.triggers
from (values ('pl'), ('vul')) as c(category)
cross join (values
  ('roue-x2',      'DÉPOSE/REPOSE ROUE X2',         2, 18, 8, array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.essieu_etat']),
  ('pneu-x2',      'DÉPOSE/REPOSE PNEUMATIQUE X2',  2, 18, 8, array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.essieu_etat']),
  ('recyclage-x2', 'RECYCLAGE PNEUMATIQUE X2',      2,  8, 4, array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.essieu_etat']),
  ('roue-x4',      'DÉPOSE/REPOSE ROUE X4',         4, 18, 8, array['pneus.arriere_etat']),
  ('pneu-x4',      'DÉPOSE/REPOSE PNEUMATIQUE X4',  4, 18, 8, array['pneus.arriere_etat']),
  ('recyclage-x4', 'RECYCLAGE PNEUMATIQUE X4',      4,  8, 4, array['pneus.arriere_etat'])
) as f(code, name, qty, pl, vul, triggers)
on conflict (legacy_id) do nothing;

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
                               standard_hours, labor_category, unit_price, package_id)
  select p_repair_order_id, 'planned', v_next_pos + (row_number() over (order by p.name))::integer - 1, 'package',
         p.name || coalesce(E'\n' || nullif(p.details, ''), ''),
         p.standard_hours, v_ro.vehicle_type::text::public.labor_category, p.price, p.id
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
           p.standard_hours, p.price, p.name, w.ord
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
                               standard_hours, labor_category, unit_price, package_id)
  select p_repair_order_id, 'planned',
         (select coalesce(max(position) + 1, 0) from public.ro_lines
          where repair_order_id = p_repair_order_id and kind = 'planned')
           + (row_number() over (order by w.ord, w.name))::integer - 1,
         'package', w.description, w.standard_hours, v_ro.vehicle_type::text::public.labor_category, w.price,
         w.package_id
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
    -- Forfaits des essieux ajoutés : ils remplacent la ligne « Remplacement … »
    continue when exists (select 1 from public.service_packages p
                          where p.is_active and 'pneus.essieu_etat' = any (p.trigger_fields)
                            and public.package_fits_vehicle(p.category, v_ro.vehicle_type));
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
