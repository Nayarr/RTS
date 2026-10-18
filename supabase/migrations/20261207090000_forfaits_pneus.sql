-- =============================================================================
-- RTS Atelier : forfaits des pneus déclenchés par la fiche de contrôle, au devis seulement
--
-- Pneus avant, ou essieu ajouté, à 50 % ou HS : dépose/repose roue x2, dépose/repose
-- pneumatique x2, recyclage pneumatique x2 ; pneus arrière : les mêmes x4. Barème PL (remorque
-- comprise) 18 / 18 / 8 € HT par pneu, VUL 8 / 8 / 4 € HT. Poids lourd, pneus avant : équilibrage
-- x2 en plus (35 € HT par roue). Temps de barème : 30 min à l'avant (et par essieu ajouté), 1 h à
-- l'arrière d'un poids lourd, 30 min à l'arrière d'un utilitaire, portés par la dépose/repose des
-- roues. Tout se règle dans Stock › Forfaits.
-- Le technicien ne voit pas ces forfaits (« devis et facture seulement ») : il a la ligne
-- « Remplacement Pneus avant / arrière / essieu N », qui n'est pas reprise au devis.
-- Contrairement aux autres cases de la fiche, une case de pneus déclenche tous ses forfaits, et
-- chaque essieu ajouté son propre lot ; la position est rappelée dans le libellé (« (avant) »).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Forfait « devis et facture seulement » et lignes réservées au devis ou à l'atelier
-- ---------------------------------------------------------------------------
alter table public.service_packages add column quote_only boolean not null default false;
comment on column public.service_packages.quote_only is
  'Devis et facture seulement : invisible pour le technicien (forfaits des pneus, recyclage…).';

alter table public.ro_lines add column visibility text not null default 'all'
  check (visibility in ('all', 'quote', 'workshop'));
comment on column public.ro_lines.visibility is
  'all : partout ; quote : devis et facture seulement (caché au technicien, sans temps à estimer) ; '
  'workshop : tâche du technicien, non reprise au devis ni à la facture (couverte par des forfaits).';

-- Forfait « devis seulement » d'une ligne de devis
create function public.package_is_quote_only(p_package_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select quote_only from public.service_packages where id = p_package_id), false);
$$;
revoke execute on function public.package_is_quote_only(uuid) from public, anon;

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
insert into public.service_packages (legacy_id, name, category, standard_hours, price, trigger_fields, quote_only)
select 'pneus:' || c.category || ':' || f.code, f.name, c.category::public.labor_category,
       case when c.category = 'vul' and f.code = 'roue-x4' then 0.5 else f.hours end,
       f.qty * case c.category when 'pl' then f.pl else f.vul end, f.triggers, true
from (values ('pl'), ('vul')) as c(category)
cross join (values
  ('roue-x2',      'DÉPOSE/REPOSE ROUE X2',         2, 18, 8, 0.5, array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.essieu_etat']),
  ('pneu-x2',      'DÉPOSE/REPOSE PNEUMATIQUE X2',  2, 18, 8, 0,   array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.essieu_etat']),
  ('recyclage-x2', 'RECYCLAGE PNEUMATIQUE X2',      2,  8, 4, 0,   array['pneus.avant_etat', 'pneus.milieu_etat', 'pneus.essieu_etat']),
  ('roue-x4',      'DÉPOSE/REPOSE ROUE X4',         4, 18, 8, 1,   array['pneus.arriere_etat']),
  ('pneu-x4',      'DÉPOSE/REPOSE PNEUMATIQUE X4',  4, 18, 8, 0,   array['pneus.arriere_etat']),
  ('recyclage-x4', 'RECYCLAGE PNEUMATIQUE X4',      4,  8, 4, 0,   array['pneus.arriere_etat'])
) as f(code, name, qty, pl, vul, hours, triggers)
on conflict (legacy_id) do nothing;

-- Poids lourd seulement (ni utilitaire, ni remorque) : équilibrage des 2 roues avant
insert into public.service_packages (legacy_id, name, category, standard_hours, price, trigger_fields, quote_only)
values ('pneus:pl:equilibrage-x2', 'ÉQUILIBRAGE X2', 'pl', 0, 70, array['pneus.avant_etat'], true)
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
           p.standard_hours, p.price, p.name, p.quote_only, w.ord
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
         and not (p.legacy_id = 'pneus:pl:equilibrage-x2' and v_ro.vehicle_type <> 'pl')
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
                               standard_hours, labor_category, unit_price, package_id, visibility)
  select p_repair_order_id, 'planned',
         (select coalesce(max(position) + 1, 0) from public.ro_lines
          where repair_order_id = p_repair_order_id and kind = 'planned')
           + (row_number() over (order by w.ord, w.name))::integer - 1,
         'package', w.description, w.standard_hours, v_ro.vehicle_type::text::public.labor_category, w.price,
         w.package_id, case when w.quote_only then 'quote' else 'all' end
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

-- ---------------------------------------------------------------------------
-- Devis, facture et OR issu du devis : lignes « devis seulement » et tâches de l'atelier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.build_quote_from_repair_order(p_repair_order_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_ro public.repair_orders;
  v_quote_id uuid;
  v_rate numeric;
  v_discount numeric;
  v_vat numeric;
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;

  perform public.apply_package_keywords(p_repair_order_id);

  select q.id into v_quote_id
  from public.quotes q
  where q.repair_order_id = p_repair_order_id
    and q.status not in ('accepted', 'refused')
    and q.merged_into_repair_order_id is null
  order by q.created_at desc
  limit 1;

  if v_quote_id is null then
    insert into public.quotes (repair_order_id, client_id, vehicle_id, vehicle_type)
    values (p_repair_order_id, v_ro.client_id, v_ro.vehicle_id, v_ro.vehicle_type)
    returning id into v_quote_id;
  end if;

  v_rate := public.labor_rate_for(v_ro.client_id, v_ro.vehicle_type);
  select coalesce(discount_percent, 0) into v_discount from public.clients where id = v_ro.client_id;
  v_discount := coalesce(v_discount, 0);
  select default_vat_rate into v_vat from public.company_settings;

  insert into public.quote_lines (
    quote_id, section, position, line_type, description, unit_price, quantity, discount_percent, vat_rate,
    labor_category, estimated_hours, standard_hours, billed_hours, package_id, part_id, supplier_id,
    purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref, source_ro_line_id)
  select
    v_quote_id,
    case l.kind when 'done' then 'done'::public.quote_section else 'planned' end,
    l.position,
    l.line_type,
    l.description,
    case
      when l.line_type = 'package' then l.unit_price
      when l.line_type = 'labor' then case when h.hours is not null then coalesce(l.unit_price, v_rate) else l.unit_price end
      when l.line_type = 'part' then l.unit_price
    end,
    case when l.line_type = 'labor' and h.hours is not null then h.hours else l.quantity end,
    case when l.line_type = 'text' then 0 else greatest(l.discount_percent, v_discount) end,
    v_vat,
    case when l.line_type in ('labor', 'package') then coalesce(l.labor_category, v_ro.vehicle_type::text::public.labor_category) end,
    l.estimated_hours, l.standard_hours, l.billed_hours, l.package_id, l.part_id, l.supplier_id,
    l.purchase_price, l.shipping_cost, l.brand, l.manufacturer_ref, l.oem_ref, l.id
  from public.ro_lines l
  cross join lateral (
    select coalesce(nullif(l.billed_hours, 0), nullif(l.standard_hours, 0), nullif(l.estimated_hours, 0)) as hours
  ) h
  where l.repair_order_id = p_repair_order_id
    -- Tâche de l'atelier couverte par des forfaits (remplacement des pneus) : pas au devis
    and l.visibility <> 'workshop'
    and not exists (select 1 from public.quote_lines ql where ql.quote_id = v_quote_id and ql.source_ro_line_id = l.id);

  update public.quotes set status = 'in_progress'
   where id = v_quote_id and status = 'draft'
     and exists (select 1 from public.quote_lines where quote_id = v_quote_id);

  return v_quote_id;
end;
$$;

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

    -- Déplacement (intervention extérieure / dépannage)
    if v_ro.intervention_type = 'roadside' then
      if v_settings.roadside_flat_fee > 0 then
        insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price, quantity, discount_percent, vat_rate)
        values (v_invoice_id, v_ro.id, v_base + 7000, 'travel',
                'Forfait de déplacement' || coalesce(' · ' || nullif(v_ro.roadside_address, ''), ''),
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

CREATE OR REPLACE FUNCTION public.complete_repair_order(p_repair_order_id uuid, p_quote_needed boolean DEFAULT false)
 RETURNS repair_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
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
    and not public.package_is_quote_only(package_id);

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
         ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent, ql.package_id,
         ql.id, case when public.package_is_quote_only(ql.package_id) then 'quote' else 'all' end
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
  join public.service_packages p on p.id = ql.package_id and p.quote_only and p.trigger_fields && array[
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
         ql.package_id, ql.part_id, ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand,
         ql.manufacturer_ref, ql.oem_ref,
         case when ql.line_type = 'part' then 'to_order'::public.part_order_status end, ql.id,
         case when public.package_is_quote_only(ql.package_id) then 'quote' else 'all' end
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.line_type in ('labor', 'package', 'part', 'text');
  perform set_config('rts.system', '', true);

  update public.quotes set merged_into_repair_order_id = p_repair_order_id where id = p_quote_id;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id, 'Travaux repris depuis le devis ' || coalesce(v_quote.number, 'sans numéro'), auth.uid());
end;
$$;

CREATE OR REPLACE FUNCTION public.pre_quote_work_lines(p_repair_order_id uuid)
 RETURNS TABLE(id uuid, description text, hours numeric, suggested_price numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
  select l.id, l.description, h.hours,
         coalesce(nullif(l.unit_price, 0) * case when l.line_type = 'package' then l.quantity else 1 end,
                  round(public.labor_rate_for(r.client_id, r.vehicle_type) * coalesce(h.hours, 0), 2))
  from public.ro_lines l
  join public.repair_orders r on r.id = l.repair_order_id
  cross join lateral (
    select coalesce(nullif(l.billed_hours, 0), nullif(l.standard_hours, 0), nullif(l.estimated_hours, 0)) as hours
  ) h
  where l.repair_order_id = p_repair_order_id and l.kind = 'done' and l.visibility <> 'workshop'
    and l.line_type not in ('text', 'part') and btrim(l.description) <> ''
  order by l.position, l.created_at;
$$;
