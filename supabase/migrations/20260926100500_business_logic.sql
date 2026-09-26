-- =============================================================================
-- RTS Atelier — 06. Logique métier : triggers et fonctions appelées par l'appli
-- =============================================================================
-- Principe : toute écriture sensible (numérotation, émission de facture, badgeage,
-- pointage, stock…) passe par une fonction exécutée côté base, en transaction,
-- avec contrôle explicite des droits. Le navigateur ne fait que l'appeler
-- (supabase.rpc('nom_fonction', {...})).
--
-- Contextes spéciaux (variables de transaction) :
--   rts.system    = 'on'  -> écriture faite par une fonction système (contourne les gardes « technicien »)
--   rts.issuing   = 'on'  -> émission de facture en cours (issue_invoice)
--   rts.migration = 'on'  -> script de reprise des données Firestore (connexion postgres uniquement)
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- Utilitaires internes
-- ---------------------------------------------------------------------------

-- Le mode « reprise de données » n'est reconnu que hors requête API (connexion
-- directe à la base, sans JWT) : un utilisateur de l'appli ne peut pas l'activer.
create or replace function public.is_migration_context()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('rts.migration', true), '') = 'on'
     and coalesce(current_setting('request.jwt.claims', true), '') = '';
$$;

create or replace function public.is_system_context()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('rts.system', true), '') = 'on'
      or public.is_migration_context();
$$;

create or replace function public.assert_office()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_office() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_direction()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.repair_order_status_label(p_status public.repair_order_status)
returns text
language sql
immutable
as $$
  select case p_status
    when 'assigned'      then 'Assigné'
    when 'in_progress'   then 'En cours'
    when 'work_done'     then 'Terminé atelier'
    when 'quote_pending' then 'Devis à faire'
    when 'to_invoice'    then 'Facture à faire'
    when 'invoiced'      then 'Facturé'
  end;
$$;

-- Un forfait est-il compatible avec le type de véhicule de l'OR ? (règle de l'ancienne appli)
create or replace function public.package_fits_vehicle(
  p_category public.labor_category,
  p_vehicle_type public.vehicle_type
)
returns boolean
language sql
immutable
as $$
  select case
    when p_category is null then true
    when p_vehicle_type in ('pl', 'remorque') then p_category in ('pl', 'remorque', 'tolerie')
    when p_vehicle_type = 'vul' then p_category in ('vul', 'tolerie')
    else true
  end;
$$;

-- Taux horaire applicable : taux spécifique du client, sinon taux standard du type de véhicule.
create or replace function public.labor_rate_for(p_client_id uuid, p_vehicle_type public.vehicle_type)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.hourly_rate from public.clients c where c.id = p_client_id),
    (select r.hourly_rate from public.labor_rates r where r.category = p_vehicle_type::text::public.labor_category),
    0
  );
$$;

-- Texte normalisé pour la détection des forfaits par mots-clés :
-- minuscules, sans accents, « av » -> « avant », « ar » -> « arriere », pluriels en « s » retirés.
create or replace function public.normalize_match_text(p_text text)
returns text
language sql
stable
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(lower(extensions.unaccent(coalesce(p_text, ''))), '\mav\M', 'avant', 'g'),
             '\mar\M', 'arriere', 'g'),
           's\M', '', 'g');
$$;

-- ---------------------------------------------------------------------------
-- Colonnes automatiques : updated_at et auteur
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'updated_at' and t.table_type = 'BASE TABLE'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      r.table_name);
  end loop;

  for r in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and c.column_name in ('created_by', 'recorded_by', 'sent_by', 'entered_by', 'uploaded_by')
  loop
    execute format('alter table public.%I alter column %I set default auth.uid()', r.table_name, r.column_name);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ordres de réparation
-- ---------------------------------------------------------------------------

create or replace function public.repair_orders_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  select * into v_vehicle from public.vehicles where id = new.vehicle_id;

  -- Numéro OR : toujours attribué par la base (sauf reprise des anciennes données).
  if not public.is_migration_context() or new.number is null then
    new.number := public.next_document_number('repair_order');
  end if;

  new.vehicle_type := coalesce(new.vehicle_type, v_vehicle.vehicle_type, 'pl');
  new.client_id := coalesce(new.client_id, v_vehicle.client_id);
  new.assignment_changed_at := now();
  return new;
end;
$$;

create trigger repair_orders_before_insert
  before insert on public.repair_orders
  for each row execute function public.repair_orders_before_insert();

create or replace function public.repair_orders_before_update()
returns trigger
language plpgsql
as $$
begin
  if new.number is distinct from old.number and not public.is_migration_context() then
    raise exception 'Le numéro d''un OR ne peut pas être modifié';
  end if;

  if new.technician_id is distinct from old.technician_id
     or new.planned_date is distinct from old.planned_date
     or new.planned_start is distinct from old.planned_start
     or new.planned_end is distinct from old.planned_end
     or new.requested_work is distinct from old.requested_work then
    new.assignment_changed_at := now();
  end if;

  if new.status = 'work_done' and old.status is distinct from 'work_done' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger repair_orders_before_update
  before update on public.repair_orders
  for each row execute function public.repair_orders_before_update();

-- Historique automatique : création, changement de statut, changement de technicien.
create or replace function public.repair_orders_log_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tech_name text;
begin
  if public.is_migration_context() then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (new.id, 'OR créé : ' || new.number, auth.uid());
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (new.id,
            'Statut : ' || public.repair_order_status_label(old.status) || ' → ' || public.repair_order_status_label(new.status),
            auth.uid());
  end if;

  if new.technician_id is distinct from old.technician_id then
    select display_name into v_tech_name from public.technicians where id = new.technician_id;
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (new.id, 'Technicien : ' || coalesce(v_tech_name, 'non assigné'), auth.uid());
  end if;
  return null;
end;
$$;

create trigger repair_orders_log_changes
  after insert or update on public.repair_orders
  for each row execute function public.repair_orders_log_changes();

-- Le technicien assigné qui travaille sur un OR « Assigné » le passe « En cours ».
create or replace function public.mark_in_progress_if_technician(p_repair_order_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.repair_orders
     set status = 'in_progress'
   where id = p_repair_order_id
     and status = 'assigned'
     and public.current_technician_id() is not null
     and technician_id = public.current_technician_id();
$$;

create or replace function public.touch_repair_order_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_system_context() then
    perform public.mark_in_progress_if_technician(
      case when tg_op = 'DELETE' then old.repair_order_id else new.repair_order_id end);
  end if;
  return null;
end;
$$;

create trigger ro_lines_touch_activity
  after insert or update or delete on public.ro_lines
  for each row execute function public.touch_repair_order_activity();
create trigger ro_photos_touch_activity
  after insert or delete on public.ro_photos
  for each row execute function public.touch_repair_order_activity();
create trigger inspections_touch_activity
  after insert or update on public.inspections
  for each row execute function public.touch_repair_order_activity();

-- Accès en écriture d'un utilisateur à un OR : bureau, ou technicien assigné sur un OR non clôturé.
create or replace function public.lock_repair_order_for_work(p_repair_order_id uuid)
returns public.repair_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_tech uuid := public.current_technician_id();
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id for update;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;
  if public.is_office() then
    return v_ro;
  end if;
  if v_tech is null or v_ro.technician_id is distinct from v_tech then
    raise exception 'Cet OR ne t''est pas assigné' using errcode = '42501';
  end if;
  if v_ro.status not in ('assigned', 'in_progress') then
    raise exception 'Cet OR est terminé, modification impossible.' using errcode = '42501';
  end if;
  return v_ro;
end;
$$;

-- Garde « technicien » sur les lignes d'OR : un technicien écrit des descriptions
-- et des temps, jamais de prix, de remises ni de forfaits (ajoutés par le système).
create or replace function public.ro_lines_guard_technician()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed_changes text[] := array['description', 'estimated_hours', 'estimate_is_minimum', 'position', 'updated_at'];
begin
  if public.is_system_context() or public.is_office() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.line_type not in ('labor', 'text')
       or new.unit_price is not null or new.purchase_price is not null or new.shipping_cost is not null
       or new.discount_percent <> 0 or new.billed_hours is not null or new.order_status is not null
       or new.package_id is not null or new.part_id is not null or new.supplier_id is not null then
      raise exception 'Un technicien ne peut ajouter que des lignes de travaux sans prix' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - v_allowed_changes) is distinct from (to_jsonb(old) - v_allowed_changes) then
      raise exception 'Modification non autorisée pour un technicien' using errcode = '42501';
    end if;
    if old.line_type = 'package' and new.description is distinct from old.description then
      raise exception 'Le libellé d''un forfait ne peut pas être modifié' using errcode = '42501';
    end if;
    return new;
  end if;

  -- DELETE : seules les lignes libres (pas les forfaits ni les pièces) peuvent être retirées
  if old.line_type not in ('labor', 'text') then
    raise exception 'Cette ligne ne peut pas être supprimée par un technicien' using errcode = '42501';
  end if;
  return old;
end;
$$;

create trigger ro_lines_guard_technician
  before insert or update or delete on public.ro_lines
  for each row execute function public.ro_lines_guard_technician();

-- ---------------------------------------------------------------------------
-- Fiche de contrôle -> forfaits et lignes « Remplacement … » automatiques
-- ---------------------------------------------------------------------------

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
      ('controles.eclairage',       'Éclairage — ampoules',         null)
    ) as f(key, label, hours)
  loop
    v_path := string_to_array(v_field.key, '.');
    continue when (p_new #>> v_path) is null or (p_new #>> v_path) not in ('HS', '50');
    continue when (p_old #>> v_path) is not distinct from (p_new #>> v_path);
    continue when v_path[1] = 'usure'
              and exists (select 1 from public.service_packages p where v_path[2] = any (p.trigger_fields));

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

create or replace function public.inspections_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_migration_context() then
    perform public.sync_inspection_work(
      new.repair_order_id,
      case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end,
      new.data);
  end if;
  return null;
end;
$$;

create trigger inspections_after_write
  after insert or update of data on public.inspections
  for each row execute function public.inspections_after_write();

create or replace function public.inspections_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger inspections_before_write
  before insert or update on public.inspections
  for each row execute function public.inspections_before_write();

-- Conversion des lignes de travaux en forfait selon les mots-clés (appelée à
-- l'ouverture du devis et de la facture, comme dans l'ancienne appli).
-- Retourne les noms des forfaits appliqués.
create or replace function public.apply_package_keywords(p_repair_order_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_line public.ro_lines;
  v_pkg public.service_packages;
  v_text text;
  v_applied text[] := '{}'::text[];
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;

  perform set_config('rts.system', 'on', true);

  for v_line in
    select * from public.ro_lines
    where repair_order_id = p_repair_order_id and line_type = 'labor'
    order by kind, position
  loop
    v_text := ' ' || public.normalize_match_text(v_line.description) || ' ';

    select p.* into v_pkg
    from public.service_packages p
    where p.is_active
      and public.package_fits_vehicle(p.category, v_ro.vehicle_type)
      and exists (
        select 1 from unnest(p.keywords) as g(grp)
        where public.normalize_match_text(g.grp) ~ '\S'
          and not exists (
            select 1 from regexp_split_to_table(btrim(public.normalize_match_text(g.grp)), '\s+') as w(word)
            where w.word <> '' and position(w.word in v_text) = 0))
    order by p.standard_hours desc, p.name
    limit 1;

    continue when not found;
    -- Forfait déjà présent sur l'OR : on garde la ligne d'origine (aucune perte d'information).
    continue when exists (select 1 from public.ro_lines where repair_order_id = p_repair_order_id and package_id = v_pkg.id);

    update public.ro_lines
       set line_type = 'package',
           package_id = v_pkg.id,
           description = v_pkg.name || coalesce(E'\n' || nullif(v_pkg.details, ''), ''),
           standard_hours = v_pkg.standard_hours,
           labor_category = coalesce(v_pkg.category, v_ro.vehicle_type::text::public.labor_category),
           unit_price = v_pkg.price,
           estimated_hours = case when kind = 'planned' then null else estimated_hours end
     where id = v_line.id;

    v_applied := v_applied || v_pkg.name;
  end loop;

  perform set_config('rts.system', '', true);
  return v_applied;
end;
$$;

-- ---------------------------------------------------------------------------
-- Actions technicien : champs de l'OR, échéances, chrono, clôture
-- ---------------------------------------------------------------------------

-- Champs de l'OR modifiables par le technicien (kilométrage, dépannage).
create or replace function public.tech_update_repair_order(p_repair_order_id uuid, p_patch jsonb)
returns public.repair_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_key text;
  v_allowed text[] := array['mileage', 'intervention_type', 'roadside_address', 'roadside_km', 'roadside_travel_hours'];
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'Champ non modifiable : %', v_key using errcode = '22023';
    end if;
  end loop;

  update public.repair_orders set
    mileage               = case when p_patch ? 'mileage' then (p_patch ->> 'mileage')::integer else mileage end,
    intervention_type     = case when p_patch ? 'intervention_type' then (p_patch ->> 'intervention_type')::public.intervention_type else intervention_type end,
    roadside_address      = case when p_patch ? 'roadside_address' then p_patch ->> 'roadside_address' else roadside_address end,
    roadside_km           = case when p_patch ? 'roadside_km' then (p_patch ->> 'roadside_km')::numeric else roadside_km end,
    roadside_travel_hours = case when p_patch ? 'roadside_travel_hours' then (p_patch ->> 'roadside_travel_hours')::numeric else roadside_travel_hours end
  where id = p_repair_order_id
  returning * into v_ro;

  perform public.mark_in_progress_if_technician(p_repair_order_id);
  return v_ro;
end;
$$;

-- Échéances contrôle technique / hayon du véhicule, saisies depuis l'OR.
create or replace function public.update_vehicle_deadlines(p_repair_order_id uuid, p_patch jsonb)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_vehicle public.vehicles;
  v_key text;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('ct_due_date', 'tailgate_due_date') then
      raise exception 'Champ non modifiable : %', v_key using errcode = '22023';
    end if;
  end loop;

  update public.vehicles set
    ct_due_date       = case when p_patch ? 'ct_due_date' then (p_patch ->> 'ct_due_date')::date else ct_due_date end,
    tailgate_due_date = case when p_patch ? 'tailgate_due_date' then (p_patch ->> 'tailgate_due_date')::date else tailgate_due_date end
  where id = v_ro.vehicle_id
  returning * into v_vehicle;

  return v_vehicle;
end;
$$;

create or replace function public.start_timer(p_repair_order_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_tech uuid := public.current_technician_id();
  v_missing text[];
  v_entry public.time_entries;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  if v_tech is null or v_ro.technician_id is distinct from v_tech then
    raise exception 'Seul le technicien assigné peut démarrer le badgeage' using errcode = '42501';
  end if;
  if v_ro.mileage is null then
    raise exception 'Renseigne le kilométrage avant de démarrer le badgeage' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(l), '{}') into v_missing
  from unnest(public.required_photo_labels(v_ro.vehicle_type)) as l
  where not exists (select 1 from public.ro_photos p where p.repair_order_id = p_repair_order_id and p.label = l);
  if cardinality(v_missing) > 0 then
    raise exception 'Photos manquantes avant de démarrer : %', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;

  if exists (select 1 from public.time_entries where repair_order_id = p_repair_order_id and ended_at is null) then
    raise exception 'Le badgeage est déjà en cours' using errcode = 'P0001';
  end if;

  insert into public.time_entries (repair_order_id, technician_id)
  values (p_repair_order_id, v_tech)
  returning * into v_entry;

  update public.repair_orders set status = 'in_progress' where id = p_repair_order_id and status = 'assigned';
  insert into public.ro_events (repair_order_id, label, actor_id) values (p_repair_order_id, 'Badgeage démarré', auth.uid());
  return v_entry;
end;
$$;

-- Arrêt du chrono : par le technicien assigné, ou arrêt forcé par la direction.
create or replace function public.stop_timer(p_repair_order_id uuid)
returns public.time_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_tech uuid := public.current_technician_id();
  v_entry public.time_entries;
  v_forced boolean;
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id for update;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;

  v_forced := not (v_tech is not null and v_ro.technician_id = v_tech);
  if v_forced and not public.is_direction() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  update public.time_entries
     set ended_at = now(),
         stopped_by = case when v_forced then auth.uid() end
   where repair_order_id = p_repair_order_id and ended_at is null
  returning * into v_entry;

  if not found then
    raise exception 'Aucun badgeage en cours sur cet OR' using errcode = 'P0001';
  end if;

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id, case when v_forced then 'Chrono arrêté par la direction' else 'Badgeage mis en pause' end, auth.uid());
  return v_entry;
end;
$$;

-- « Terminer l'intervention » : vérifie les temps, arrête le chrono, verrouille l'OR.
-- p_quote_needed = réponse à « Un devis est-il nécessaire avant facturation ? »
create or replace function public.complete_repair_order(p_repair_order_id uuid, p_quote_needed boolean default false)
returns public.repair_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  if exists (select 1 from public.ro_lines
             where repair_order_id = p_repair_order_id and kind = 'done'
               and line_type in ('labor', 'package') and estimated_hours is null) then
    raise exception 'Renseigne le temps pour chaque tâche de « Travaux effectués »' using errcode = 'P0001';
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
          'Travaux marqués terminés' || case when p_quote_needed then ' — devis à faire' else '' end,
          auth.uid());
  return v_ro;
end;
$$;

-- ---------------------------------------------------------------------------
-- Consommables : stock tenu par le journal des mouvements
-- ---------------------------------------------------------------------------

create or replace function public.consumable_movements_apply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.consumables set stock_qty = stock_qty + new.quantity where id = new.consumable_id;
  return null;
end;
$$;

create trigger consumable_movements_apply
  after insert on public.consumable_movements
  for each row execute function public.consumable_movements_apply();

create or replace function public.ro_consumables_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.consumable_movements (consumable_id, quantity, reason, repair_order_id, ro_consumable_id, created_by)
    values (new.consumable_id, -new.quantity, 'usage', new.repair_order_id, new.id, auth.uid());
    return null;
  end if;

  insert into public.consumable_movements (consumable_id, quantity, reason, repair_order_id, note, created_by)
  values (old.consumable_id, old.quantity, 'usage_cancel',
          case when exists (select 1 from public.repair_orders where id = old.repair_order_id) then old.repair_order_id end,
          'Retrait d''un consommable de l''OR', auth.uid());
  return null;
end;
$$;

create trigger ro_consumables_stock
  after insert or delete on public.ro_consumables
  for each row execute function public.ro_consumables_stock();

-- Prix figés depuis la fiche du consommable si non fournis.
create or replace function public.ro_consumables_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.consumables;
begin
  select * into v_c from public.consumables where id = new.consumable_id;
  new.unit := coalesce(new.unit, v_c.unit);
  new.unit_sale_price := coalesce(new.unit_sale_price, v_c.sale_price);
  new.unit_purchase_price := coalesce(new.unit_purchase_price, v_c.purchase_price);
  return new;
end;
$$;

create trigger ro_consumables_defaults
  before insert on public.ro_consumables
  for each row execute function public.ro_consumables_defaults();

-- ---------------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------------

-- Crée (ou reprend) le devis de l'OR et y importe les lignes de l'OR pas encore
-- reprises, avec chiffrage automatique de la main d'œuvre au taux applicable.
create or replace function public.build_quote_from_repair_order(p_repair_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
    and not exists (select 1 from public.quote_lines ql where ql.quote_id = v_quote_id and ql.source_ro_line_id = l.id);

  update public.quotes set status = 'in_progress'
   where id = v_quote_id and status = 'draft'
     and exists (select 1 from public.quote_lines where quote_id = v_quote_id);

  return v_quote_id;
end;
$$;

-- Numéro de devis (à la première génération du PDF). p_mark_sent : le devis passe « Envoyé ».
create or replace function public.assign_quote_number(p_quote_id uuid, p_mark_sent boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_validity integer;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;

  select quote_validity_days into v_validity from public.company_settings;

  if v_quote.number is null then
    update public.quotes
       set number = public.next_document_number('quote'),
           issued_at = now(),
           valid_until = current_date + v_validity
     where id = p_quote_id
    returning * into v_quote;
  end if;

  if p_mark_sent and v_quote.status in ('draft', 'in_progress') then
    update public.quotes set status = 'sent', sent_at = coalesce(sent_at, now()) where id = p_quote_id;
  end if;
  return v_quote.number;
end;
$$;

-- Envoi du devis en ligne : numéro + lien à signer. Retourne le jeton du lien.
create or replace function public.share_quote(p_quote_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
begin
  perform public.assert_office();

  if not exists (select 1 from public.quote_lines where quote_id = p_quote_id and line_type <> 'text' and net_ht > 0) then
    raise exception 'Le devis est vide' using errcode = 'P0001';
  end if;

  perform public.assign_quote_number(p_quote_id, false);

  update public.quotes
     set public_token = coalesce(public_token, public.generate_public_token()),
         status = case when status in ('accepted', 'refused') then status else 'sent' end,
         sent_at = now()
   where id = p_quote_id
  returning * into v_quote;

  if v_quote.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label, actor_id)
    values (v_quote.repair_order_id, 'Devis ' || v_quote.number || ' envoyé au client (lien en ligne)', auth.uid());
  end if;
  return v_quote.public_token;
end;
$$;

-- Crée un OR à partir d'un devis :
--   * devis accepté d'un OR  -> nouvel OR avec les travaux acceptés (ancien « assignation »)
--   * devis sans OR          -> transformation du devis en OR
create or replace function public.create_repair_order_from_quote(p_quote_id uuid, p_technician_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  select string_agg(split_part(description, E'\n', 1), ', ' order by position) into v_summary
  from public.quote_lines where quote_id = p_quote_id and section = 'planned' and line_type <> 'text';

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    origin_repair_order_id, origin_quote_id)
  values (v_quote.vehicle_id, v_quote.client_id, v_quote.vehicle_type, p_technician_id,
          coalesce(nullif(v_summary, ''), 'Travaux issus du devis ' || coalesce(v_quote.number, '')),
          v_quote.repair_order_id, v_quote.id)
  returning id into v_ro_id;

  perform set_config('rts.system', 'on', true);
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours,
                               billed_hours, labor_category, unit_price, quantity, discount_percent, package_id, part_id,
                               supplier_id, purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref,
                               order_status, source_quote_line_id)
  select v_ro_id, 'planned', ql.position, ql.line_type, ql.description, ql.estimated_hours, ql.standard_hours,
         ql.billed_hours, ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent, ql.package_id, ql.part_id,
         ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand, ql.manufacturer_ref, ql.oem_ref,
         case when ql.line_type = 'part' then 'to_order'::public.part_order_status end, ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type in ('labor', 'package', 'part', 'text');
  perform set_config('rts.system', '', true);

  if v_standalone then
    update public.quotes set repair_order_id = v_ro_id where id = p_quote_id;
  else
    update public.quotes set resulting_repair_order_id = v_ro_id where id = p_quote_id;
    insert into public.ro_events (repair_order_id, label, actor_id)
    select v_quote.repair_order_id,
           'Devis accepté — nouvel OR ' || r.number || ' créé', auth.uid()
    from public.repair_orders r where r.id = v_ro_id;
  end if;
  return v_ro_id;
end;
$$;

-- Rattache un devis sans OR à un OR existant (reprend ses travaux à prévoir).
create or replace function public.merge_quote_into_repair_order(p_quote_id uuid, p_repair_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
                               order_status, source_quote_line_id)
  select p_repair_order_id, 'planned', v_offset + ql.position, ql.line_type, ql.description, ql.estimated_hours,
         ql.standard_hours, ql.billed_hours, ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent,
         ql.package_id, ql.part_id, ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand,
         ql.manufacturer_ref, ql.oem_ref,
         case when ql.line_type = 'part' then 'to_order'::public.part_order_status end, ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.line_type in ('labor', 'package', 'part', 'text');
  perform set_config('rts.system', '', true);

  update public.quotes set merged_into_repair_order_id = p_repair_order_id where id = p_quote_id;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id, 'Travaux repris depuis le devis ' || coalesce(v_quote.number, 'sans numéro'), auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Rendez-vous
-- ---------------------------------------------------------------------------

-- « Le véhicule est arrivé : créer l'OR »
create or replace function public.create_repair_order_from_appointment(p_appointment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments;
  v_ro_id uuid;
begin
  perform public.assert_office();
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Rendez-vous introuvable' using errcode = 'P0002';
  end if;
  if v_appt.status <> 'planned' then
    raise exception 'Ce rendez-vous n''est plus à venir' using errcode = 'P0001';
  end if;
  if v_appt.vehicle_id is null then
    raise exception 'Renseigne l''immatriculation du rendez-vous avant de créer l''OR' using errcode = 'P0001';
  end if;

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    planned_date, planned_start, planned_end, appointment_id, maintenance_contract_id)
  values (v_appt.vehicle_id, v_appt.client_id, v_appt.vehicle_type, v_appt.technician_id,
          coalesce(nullif(v_appt.reason, ''), 'Rendez-vous'),
          v_appt.scheduled_date, v_appt.start_time, v_appt.end_time, v_appt.id, v_appt.maintenance_contract_id)
  returning id into v_ro_id;

  update public.appointments set status = 'converted', repair_order_id = v_ro_id where id = p_appointment_id;
  return v_ro_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Factures
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
    where l.repair_order_id = v_ro.id and l.kind = 'done' and (btrim(l.description) <> '' or l.unit_price is not null);

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

-- Émission définitive : numéro, instantané client, totaux figés, OR passés « Facturé ».
create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_client public.clients;
  v_terms integer;
  v_ht numeric;
  v_vat numeric;
  v_number text;
begin
  perform public.assert_office();

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Cette facture est déjà émise (%)', v_invoice.number using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id and line_type <> 'text') then
    raise exception 'La facture est vide' using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = v_invoice.client_id;
  select payment_terms_days into v_terms from public.company_settings;

  select coalesce(sum(net_ht), 0) into v_ht from public.invoice_lines where invoice_id = p_invoice_id;
  select coalesce(sum(round(g.base * g.vat_rate / 100, 2)), 0) into v_vat
  from (
    select vat_rate, sum(net_ht) as base
    from public.invoice_lines
    where invoice_id = p_invoice_id and line_type <> 'text'
    group by vat_rate
  ) g;

  perform set_config('rts.issuing', 'on', true);
  v_number := public.next_document_number('invoice');

  update public.invoices set
    status = 'issued',
    number = v_number,
    issued_at = now(),
    service_date = coalesce(service_date, current_date),
    due_date = current_date + v_terms,
    client_name = v_client.name,
    client_address = v_client.billing_address,
    client_siren = v_client.siren,
    client_email = v_client.email,
    total_ht = v_ht,
    total_vat = v_vat,
    total_ttc = v_ht + v_vat,
    issued_by = auth.uid()
  where id = p_invoice_id;

  update public.repair_orders r set status = 'invoiced'
  from public.invoice_repair_orders iro
  where iro.invoice_id = p_invoice_id and iro.repair_order_id = r.id;

  insert into public.ro_events (repair_order_id, label, actor_id)
  select iro.repair_order_id, 'Facture ' || v_number || ' émise', auth.uid()
  from public.invoice_repair_orders iro where iro.invoice_id = p_invoice_id;

  perform set_config('rts.issuing', '', true);
  return v_number;
end;
$$;

-- Lien de consultation en ligne d'une facture émise. Retourne le jeton.
create or replace function public.share_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.assert_office();
  update public.invoices
     set public_token = coalesce(public_token, public.generate_public_token())
   where id = p_invoice_id and status = 'issued'
  returning public_token into v_token;
  if v_token is null then
    raise exception 'Seule une facture émise peut être envoyée' using errcode = 'P0001';
  end if;
  return v_token;
end;
$$;

-- Lien de l'espace client en ligne. Retourne le jeton.
create or replace function public.share_client_portal(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.assert_office();
  update public.clients
     set portal_token = coalesce(portal_token, public.generate_public_token())
   where id = p_client_id
  returning portal_token into v_token;
  if v_token is null then
    raise exception 'Client introuvable' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;

-- Gardes d'immuabilité des factures émises.
create or replace function public.invoices_guard()
returns trigger
language plpgsql
as $$
declare
  v_mutable text[] := array['public_token', 'pdf_file_id', 'updated_at'];
begin
  if public.is_migration_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.number is not null then
      raise exception 'Une facture est créée en brouillon puis émise via issue_invoice' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'Une facture émise ne peut pas être supprimée (faire un avoir)' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'issued' then
    if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
      raise exception 'Une facture émise ne peut plus être modifiée (faire un avoir)' using errcode = '42501';
    end if;
  elsif new.status = 'issued' or new.number is not null then
    if coalesce(current_setting('rts.issuing', true), '') <> 'on' then
      raise exception 'L''émission d''une facture passe par issue_invoice' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger invoices_guard
  before insert or update or delete on public.invoices
  for each row execute function public.invoices_guard();

create or replace function public.invoice_children_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
begin
  if public.is_migration_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from public.invoices where id = v_invoice_id and status = 'issued') then
    -- Suppression en cascade d'un brouillon : la facture n'est pas émise, donc on ne passe pas ici.
    raise exception 'Une facture émise ne peut plus être modifiée (faire un avoir)' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger invoice_lines_guard
  before insert or update or delete on public.invoice_lines
  for each row execute function public.invoice_children_guard();
create trigger invoice_repair_orders_guard
  before insert or update or delete on public.invoice_repair_orders
  for each row execute function public.invoice_children_guard();

-- Avoirs : numéro automatique, facture émise obligatoire, total crédité <= TTC facturé.
create or replace function public.credit_notes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_already numeric;
begin
  select * into v_invoice from public.invoices where id = new.invoice_id for update;
  if v_invoice.status is distinct from 'issued' then
    raise exception 'Un avoir se rattache à une facture émise' using errcode = 'P0001';
  end if;

  if not public.is_migration_context() then
    select coalesce(sum(total_ttc), 0) into v_already from public.credit_notes where invoice_id = new.invoice_id;
    if v_already + new.amount_ht + round(new.amount_ht * new.vat_rate / 100, 2) > v_invoice.total_ttc + 0.01 then
      raise exception 'Le total des avoirs dépasserait le montant de la facture' using errcode = 'P0001';
    end if;
  end if;

  if not public.is_migration_context() or new.number is null then
    new.number := public.next_document_number('credit_note');
  end if;
  new.issued_at := coalesce(new.issued_at, now());
  return new;
end;
$$;

create trigger credit_notes_before_insert
  before insert on public.credit_notes
  for each row execute function public.credit_notes_before_insert();

create or replace function public.credit_notes_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_migration_context() then
    insert into public.ro_events (repair_order_id, label, actor_id)
    select iro.repair_order_id, 'Avoir ' || new.number || ' (' || new.amount_ht || ' € HT)', auth.uid()
    from public.invoice_repair_orders iro where iro.invoice_id = new.invoice_id;
  end if;
  return null;
end;
$$;

create trigger credit_notes_after_insert
  after insert on public.credit_notes
  for each row execute function public.credit_notes_after_insert();

create or replace function public.credit_notes_guard()
returns trigger
language plpgsql
as $$
begin
  if public.is_migration_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Un avoir ne peut pas être supprimé' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['pdf_file_id']) is distinct from (to_jsonb(old) - array['pdf_file_id']) then
    raise exception 'Un avoir ne peut pas être modifié' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger credit_notes_guard
  before update or delete on public.credit_notes
  for each row execute function public.credit_notes_guard();

-- Paiements : uniquement sur une facture émise.
create or replace function public.payments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.invoices where id = new.invoice_id and status = 'issued') then
    raise exception 'Un paiement se rattache à une facture émise' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger payments_before_insert
  before insert on public.payments
  for each row execute function public.payments_before_insert();

-- ---------------------------------------------------------------------------
-- Documents publics (lien envoyé au client, sans compte)
-- ---------------------------------------------------------------------------

-- Lecture d'un devis, d'une facture ou d'un espace client à partir de son jeton.
create or replace function public.public_get_document(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company jsonb;
  v_quote public.quotes;
  v_invoice public.invoices;
  v_client public.clients;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select jsonb_build_object(
           'legal_name', legal_name, 'address_line', address_line, 'postal_code', postal_code, 'city', city,
           'email', email, 'phone', phone, 'siret', siret, 'vat_number', vat_number)
    into v_company
  from public.company_settings;

  -- Devis
  select * into v_quote from public.quotes where public_token = p_token;
  if found then
    return jsonb_build_object(
      'type', 'quote',
      'company', v_company,
      'number', v_quote.number,
      'issued_at', v_quote.issued_at,
      'valid_until', v_quote.valid_until,
      'status', v_quote.status,
      'accepted_by_name', v_quote.accepted_by_name,
      'accepted_at', v_quote.accepted_at,
      'client_name', (select name from public.clients where id = v_quote.client_id),
      'vehicle_plate', (select plate from public.vehicles where id = v_quote.vehicle_id),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'section', section, 'line_type', line_type, 'description', description,
                 'unit_price', unit_price, 'quantity', quantity, 'discount_percent', discount_percent,
                 'vat_rate', vat_rate, 'net_ht', net_ht) order by section, position)
        from public.quote_lines
        where quote_id = v_quote.id and (line_type = 'text' or net_ht > 0)), '[]'::jsonb),
      'totals', (select jsonb_build_object('total_ht', total_ht, 'total_vat', total_vat, 'total_ttc', total_ttc)
                 from public.v_quote_totals where quote_id = v_quote.id)
    );
  end if;

  -- Facture
  select * into v_invoice from public.invoices where public_token = p_token and status = 'issued';
  if found then
    return jsonb_build_object(
      'type', 'invoice',
      'company', v_company,
      'number', v_invoice.number,
      'issued_at', v_invoice.issued_at,
      'service_date', v_invoice.service_date,
      'due_date', v_invoice.due_date,
      'client_name', v_invoice.client_name,
      'client_address', v_invoice.client_address,
      'vehicle_label', v_invoice.vehicle_label,
      'mileage', v_invoice.mileage,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_type', line_type, 'description', description, 'unit_price', unit_price,
                 'quantity', quantity, 'discount_percent', discount_percent, 'vat_rate', vat_rate,
                 'net_ht', net_ht) order by position)
        from public.invoice_lines where invoice_id = v_invoice.id), '[]'::jsonb),
      'totals', jsonb_build_object('total_ht', v_invoice.total_ht, 'total_vat', v_invoice.total_vat, 'total_ttc', v_invoice.total_ttc),
      'balance_due', (select balance_due from public.v_invoice_balances where invoice_id = v_invoice.id),
      'legal_mentions', (select to_jsonb(invoice_legal_mentions) from public.company_settings)
    );
  end if;

  -- Espace client (données calculées en direct)
  select * into v_client from public.clients where portal_token = p_token;
  if found then
    -- Chaque facture affichée dans l'espace client reçoit son lien de consultation.
    update public.invoices
       set public_token = public.generate_public_token()
     where client_id = v_client.id and status = 'issued' and public_token is null;

    return jsonb_build_object(
      'type', 'portal',
      'company', v_company,
      'client_name', v_client.name,
      'generated_at', now(),
      'vehicles', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'plate', v.plate,
                 'in_workshop', cur.status is not null,
                 'status_label', coalesce(public.repair_order_status_label(cur.status), 'Pas à l''atelier'),
                 'since', cur.created_at,
                 'ct_due_date', v.ct_due_date,
                 'tailgate_due_date', v.tailgate_due_date) order by v.plate)
        from public.vehicles v
        left join lateral (
          select r.status, r.created_at from public.repair_orders r
          where r.vehicle_id = v.id and r.status not in ('invoiced')
          order by r.created_at desc limit 1) cur on true
        where v.client_id = v_client.id
           or exists (select 1 from public.repair_orders r where r.vehicle_id = v.id and r.client_id = v_client.id)), '[]'::jsonb),
      'quotes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'number', q.number, 'vehicle_plate', v.plate, 'token', q.public_token) order by q.sent_at desc)
        from public.quotes q left join public.vehicles v on v.id = q.vehicle_id
        where q.client_id = v_client.id and q.status = 'sent' and q.public_token is not null), '[]'::jsonb),
      'invoices', coalesce((
        select jsonb_agg(x.doc order by x.issued_at desc)
        from (
          select i.issued_at,
                 jsonb_build_object(
                   'number', i.number, 'issued_at', i.issued_at, 'vehicle_label', i.vehicle_label,
                   'total_ttc', i.total_ttc, 'balance_due', b.balance_due, 'payment_status', b.payment_status,
                   'token', i.public_token) as doc
          from public.invoices i
          join public.v_invoice_balances b on b.invoice_id = i.id
          where i.client_id = v_client.id and i.status = 'issued'
          order by i.issued_at desc
          limit 40) x), '[]'::jsonb)
    );
  end if;

  return null;
end;
$$;

-- Réponse du client à un devis en ligne. Appelée uniquement par l'Edge Function
-- publique (qui enregistre d'abord l'image de la signature dans R2).
create or replace function public.public_respond_quote(
  p_token text,
  p_accept boolean,
  p_signer_name text,
  p_signature_file_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_title text;
  v_body text;
begin
  select * into v_quote from public.quotes where public_token = p_token for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_quote.status in ('accepted', 'refused') then
    raise exception 'Ce devis a déjà reçu une réponse' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Ce devis n''est pas ouvert à la signature' using errcode = 'P0001';
  end if;

  if p_accept then
    if coalesce(btrim(p_signer_name), '') = '' or p_signature_file_id is null then
      raise exception 'Nom et signature obligatoires pour accepter le devis' using errcode = '22023';
    end if;
    update public.quotes
       set status = 'accepted', accepted_at = now(), accepted_by_name = btrim(p_signer_name),
           signature_file_id = p_signature_file_id
     where id = v_quote.id;
  else
    update public.quotes
       set status = 'refused', refused_at = now(), accepted_by_name = nullif(btrim(p_signer_name), '')
     where id = v_quote.id;
  end if;

  if v_quote.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label)
    values (v_quote.repair_order_id,
            'Devis ' || v_quote.number || ' ' || case when p_accept then 'accepté' else 'refusé' end
            || ' en ligne par le client' || coalesce(' (' || nullif(btrim(p_signer_name), '') || ')', ''));
  end if;

  v_title := 'Devis ' || v_quote.number || ' ' || case when p_accept then 'accepté' else 'refusé' end || ' en ligne';
  select coalesce(c.name, '') || coalesce(' — ' || v.plate, '') into v_body
  from public.quotes q left join public.clients c on c.id = q.client_id left join public.vehicles v on v.id = q.vehicle_id
  where q.id = v_quote.id;

  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  values
    ('direction', 'quote_response', v_title, v_body, v_quote.repair_order_id, '/devis/' || v_quote.id, 'quote-response-' || v_quote.id || '-direction'),
    ('reception', 'quote_response', v_title, v_body, v_quote.repair_order_id, '/devis/' || v_quote.id, 'quote-response-' || v_quote.id || '-reception')
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'refused' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Pointage : borne (PIN + photo), codes PIN, code de sortie de la borne
-- ---------------------------------------------------------------------------

create or replace function public.clock_events_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.work_date := coalesce(new.work_date, public.paris_date(new.occurred_at));
  if new.during_leave_type is null then
    select l.leave_type into new.during_leave_type
    from public.leave_requests l
    where l.technician_id = new.technician_id and l.status = 'approved' and not l.is_deleted
      and new.work_date between l.starts_on and l.ends_on
    limit 1;
  end if;
  return new;
end;
$$;

create trigger clock_events_before_insert
  before insert on public.clock_events
  for each row execute function public.clock_events_before_insert();

-- Limitation anti force brute : 5 erreurs par minute maximum.
create or replace function public.kiosk_too_many_attempts()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 5 from public.kiosk_failed_attempts where attempted_at > now() - interval '1 minute';
$$;

create or replace function public.set_technician_pin(p_technician_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_other record;
begin
  perform public.assert_direction();
  if p_pin !~ '^\d{4,6}$' then
    raise exception 'Le code doit contenir 4 à 6 chiffres' using errcode = '22023';
  end if;
  if not exists (select 1 from public.technicians where id = p_technician_id) then
    raise exception 'Technicien introuvable' using errcode = 'P0002';
  end if;

  for v_other in
    select p.pin_hash, p.algorithm, t.legacy_email
    from public.technician_pins p join public.technicians t on t.id = p.technician_id
    where p.technician_id <> p_technician_id
  loop
    if (v_other.algorithm = 'bcrypt' and extensions.crypt(p_pin, v_other.pin_hash) = v_other.pin_hash)
       or (v_other.algorithm = 'legacy_sha256'
           and encode(extensions.digest('rts:' || lower(coalesce(v_other.legacy_email, '')) || ':' || p_pin, 'sha256'), 'hex') = v_other.pin_hash) then
      raise exception 'Ce code est déjà utilisé par un autre technicien' using errcode = '23505';
    end if;
  end loop;

  insert into public.technician_pins (technician_id, pin_hash, algorithm, set_at)
  values (p_technician_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), 'bcrypt', now())
  on conflict (technician_id) do update
    set pin_hash = excluded.pin_hash, algorithm = 'bcrypt', set_at = now();
end;
$$;

-- Pointage depuis la borne. Ne lève pas d'erreur pour un mauvais code (pour que la
-- tentative soit comptée) : retourne { ok, message, … }.
create or replace function public.kiosk_clock(p_pin text, p_photo_file_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tech public.technicians;
  v_pin record;
  v_last public.clock_events;
  v_type public.clock_event_type;
  v_event public.clock_events;
  v_today date := public.paris_date(now());
begin
  if not (public.is_kiosk() or public.is_direction()) then
    raise exception 'Accès refusé : compte borne requis' using errcode = '42501';
  end if;
  if public.kiosk_too_many_attempts() then
    return jsonb_build_object('ok', false, 'message', 'Trop de tentatives, patiente une minute.');
  end if;
  if p_photo_file_id is null then
    return jsonb_build_object('ok', false, 'message', 'Caméra indisponible — pointage impossible. Préviens le bureau.');
  end if;

  if coalesce(p_pin, '') ~ '^\d{4,6}$' then
    for v_pin in
      select p.technician_id, p.pin_hash, p.algorithm, t.legacy_email
      from public.technician_pins p join public.technicians t on t.id = p.technician_id
      where t.is_active
    loop
      if v_pin.algorithm = 'bcrypt' and extensions.crypt(p_pin, v_pin.pin_hash) = v_pin.pin_hash then
        select * into v_tech from public.technicians where id = v_pin.technician_id;
        exit;
      elsif v_pin.algorithm = 'legacy_sha256'
            and encode(extensions.digest('rts:' || lower(coalesce(v_pin.legacy_email, '')) || ':' || p_pin, 'sha256'), 'hex') = v_pin.pin_hash then
        select * into v_tech from public.technicians where id = v_pin.technician_id;
        -- Ancien code (appli Firestore) : on le re-hache en bcrypt au passage.
        update public.technician_pins
           set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), algorithm = 'bcrypt'
         where technician_id = v_pin.technician_id;
        exit;
      end if;
    end loop;
  end if;

  if v_tech.id is null then
    insert into public.kiosk_failed_attempts (attempted_by) values (auth.uid());
    return jsonb_build_object('ok', false, 'message', 'Code incorrect');
  end if;

  select * into v_last from public.clock_events
  where technician_id = v_tech.id and work_date = v_today
  order by occurred_at desc limit 1;

  if v_last.id is not null and v_last.occurred_at > now() - interval '1 minute' then
    return jsonb_build_object('ok', false, 'message',
      'Déjà pointé il y a moins d''une minute (' || case when v_last.event_type = 'in' then 'arrivée' else 'départ' end || ').');
  end if;

  v_type := case when v_last.event_type = 'in' then 'out'::public.clock_event_type else 'in' end;

  insert into public.clock_events (technician_id, event_type, occurred_at, source, photo_file_id, entered_by)
  values (v_tech.id, v_type, now(), 'kiosk', p_photo_file_id, auth.uid())
  returning * into v_event;

  return jsonb_build_object(
    'ok', true,
    'technician_name', v_tech.display_name,
    'event_type', v_event.event_type,
    'occurred_at', v_event.occurred_at,
    'during_leave_type', v_event.during_leave_type);
end;
$$;

create or replace function public.set_kiosk_exit_code(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_direction();
  if p_code !~ '^\d{4,6}$' then
    raise exception 'Le code doit contenir 4 à 6 chiffres' using errcode = '22023';
  end if;
  update public.kiosk_secrets
     set exit_code_hash = extensions.crypt(p_code, extensions.gen_salt('bf', 8)), updated_at = now();
end;
$$;

create or replace function public.verify_kiosk_exit_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
begin
  if not (public.is_kiosk() or public.is_direction()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if public.kiosk_too_many_attempts() then
    return false;
  end if;
  select exit_code_hash into v_hash from public.kiosk_secrets;
  if v_hash is not null and extensions.crypt(coalesce(p_code, ''), v_hash) = v_hash then
    return true;
  end if;
  insert into public.kiosk_failed_attempts (attempted_by) values (auth.uid());
  return false;
end;
$$;
