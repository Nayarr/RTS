-- Renouvellement d'échéance à l'atelier : quand une tâche de l'OR renouvelle une échéance du
-- véhicule (contrôle technique, contrôle hayon, antipollution, extincteurs), le technicien
-- photographie la nouvelle étiquette (ou le procès-verbal) et enregistre la nouvelle date.
--   - vehicle_deadline_renewals : historique du véhicule (ancienne et nouvelle date, OR, photo, auteur).
--   - record_deadline_renewal : enregistre le renouvellement et met à jour l'échéance du véhicule
--     (ct_due_date, tailgate_due_date, antipollution_due_date ; extincteurs : un an après le
--     contrôle, lu dans les passages à l'atelier).
--   - complete_repair_order : l'OR ne peut plus être terminé tant qu'un renouvellement manque.

create table public.vehicle_deadline_renewals (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles (id) on delete cascade,
  repair_order_id  uuid references public.repair_orders (id) on delete set null,
  kind             text not null
    constraint vehicle_deadline_renewals_kind_check
    check (kind in ('ct', 'tailgate', 'antipollution', 'extinguisher')),
  previous_due     date,
  new_due          date not null,
  file_id          uuid references public.files (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint vehicle_deadline_renewals_order_kind_key unique (repair_order_id, kind)
);
create index vehicle_deadline_renewals_vehicle_idx
  on public.vehicle_deadline_renewals (vehicle_id, created_at desc);
comment on table public.vehicle_deadline_renewals is
  'Échéances renouvelées à l''atelier : ancienne et nouvelle date, OR, photo de la nouvelle étiquette.';

alter table public.vehicle_deadline_renewals enable row level security;
-- Écriture seulement par record_deadline_renewal ; lecture : bureau, ou qui peut lire l'OR
create policy vehicle_deadline_renewals_select on public.vehicle_deadline_renewals for select to authenticated
  using (public.is_office() or (repair_order_id is not null and public.can_read_repair_order(repair_order_id)));
revoke insert, update, delete, truncate on public.vehicle_deadline_renewals from anon, authenticated;
grant select on public.vehicle_deadline_renewals to authenticated;

-- Libellé d'une échéance (messages d'erreur, journal de l'OR)
create function public.deadline_kind_label(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ct' then 'Contrôle technique'
    when 'tailgate' then 'Contrôle hayon'
    when 'antipollution' then 'Contrôle antipollution'
    when 'extinguisher' then 'Contrôle des extincteurs'
  end;
$$;
revoke execute on function public.deadline_kind_label(text) from public, anon;
grant execute on function public.deadline_kind_label(text) to authenticated;

-- Échéances renouvelées par des tâches (même règle que l'appli) : « Contrôle technique » ou « CT »
-- (pas une préparation ni un pré-contrôle), contrôle ou visite du hayon, antipollution ou
-- opacité, contrôle des extincteurs (pas un remplacement seul).
create function public.renewal_kinds_of(p_texts text[])
returns text[]
language sql
stable
set search_path = ''
as $$
  with t as (
    select regexp_replace(lower(extensions.unaccent(x)), '[-''’]', ' ', 'g') as v
    from unnest(p_texts) as x
    where x is not null
  )
  select coalesce(array_agg(s.k order by s.k), array[]::text[]) from (
    select 'ct'::text as k
    where exists (select 1 from t where t.v ~ '(controle technique|\mct\M)' and t.v !~ '(pre ?controle|preparation)')
    union all
    select 'tailgate' where exists (select 1 from t where t.v ~ 'hayon' and t.v ~ '(controle|vgp|visite)')
    union all
    select 'antipollution' where exists (select 1 from t where t.v ~ '(antipollution|anti pollution|opacite)')
    union all
    select 'extinguisher'
    where exists (select 1 from t where t.v ~ 'extincteur' and t.v ~ '(controle|verification|visite|recharge)')
  ) s;
$$;
revoke execute on function public.renewal_kinds_of(text[]) from public, anon;
grant execute on function public.renewal_kinds_of(text[]) to authenticated;

-- Échéances renouvelées par un OR : demande (une tâche par ligne) et travaux effectués (les
-- réparations à prévoir sont pour plus tard)
create function public.repair_order_renewal_kinds(p_repair_order_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select public.renewal_kinds_of(
    coalesce((select regexp_split_to_array(r.requested_work, E'\n') from public.repair_orders r
              where r.id = p_repair_order_id), array[]::text[])
    || coalesce((select array_agg(l.description) from public.ro_lines l
                 where l.repair_order_id = p_repair_order_id and l.kind = 'done'
                   and l.line_type <> 'text'), array[]::text[]));
$$;
revoke execute on function public.repair_order_renewal_kinds(uuid) from public, anon;
grant execute on function public.repair_order_renewal_kinds(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Renouvellement enregistré depuis la photo de la nouvelle étiquette
-- ---------------------------------------------------------------------------
create function public.record_deadline_renewal(p_repair_order_id uuid, p_kind text, p_new_due date,
                                               p_file_id uuid)
returns public.vehicle_deadline_renewals
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_vehicle public.vehicles;
  v_previous date;
  v_due date := p_new_due;
  v_row public.vehicle_deadline_renewals;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);
  if not (p_kind = any (public.repair_order_renewal_kinds(p_repair_order_id))) then
    raise exception 'Aucun renouvellement de cette échéance prévu sur l''OR' using errcode = '22023';
  end if;
  if v_due is null then
    raise exception 'Date de la nouvelle échéance obligatoire' using errcode = '22023';
  end if;
  if p_file_id is null or not exists (select 1 from public.ro_photos p
                                      where p.repair_order_id = p_repair_order_id and p.file_id = p_file_id) then
    raise exception 'Photo de la nouvelle étiquette introuvable sur l''OR' using errcode = '22023';
  end if;
  -- Hayon et extincteurs : mois et année seulement, comme sur l'étiquette
  if p_kind in ('tailgate', 'extinguisher') then
    v_due := date_trunc('month', v_due)::date;
  end if;

  select * into v_vehicle from public.vehicles where id = v_ro.vehicle_id for update;
  v_previous := case p_kind
    when 'ct' then v_vehicle.ct_due_date
    when 'tailgate' then v_vehicle.tailgate_due_date
    when 'antipollution' then v_vehicle.antipollution_due_date
    -- Extincteurs : un an après le dernier contrôle fait à l'atelier (sur un autre OR)
    else (select date_trunc('month', max(r.created_at) + interval '1 year')::date
          from public.repair_orders r
          where r.vehicle_id = v_ro.vehicle_id and r.id <> v_ro.id
            and 'extinguisher' = any (public.repair_order_renewal_kinds(r.id)))
  end;

  update public.vehicles set
    ct_due_date = case when p_kind = 'ct' then v_due else ct_due_date end,
    tailgate_due_date = case when p_kind = 'tailgate' then v_due else tailgate_due_date end,
    antipollution_due_date = case when p_kind = 'antipollution' then v_due else antipollution_due_date end
  where id = v_vehicle.id;

  -- Nouvelle photo sur le même OR : date corrigée, ancienne date du véhicule gardée
  insert into public.vehicle_deadline_renewals (vehicle_id, repair_order_id, kind, previous_due, new_due, file_id)
  values (v_vehicle.id, p_repair_order_id, p_kind, v_previous, v_due, p_file_id)
  on conflict (repair_order_id, kind) do update
    set new_due = excluded.new_due, file_id = excluded.file_id, created_by = auth.uid(), created_at = now()
  returning * into v_row;

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id,
          public.deadline_kind_label(p_kind) || ' renouvelé : prochain '
            || case when p_kind in ('tailgate', 'extinguisher') then to_char(v_due, 'MM/YYYY')
                    else to_char(v_due, 'DD/MM/YYYY') end,
          auth.uid());
  return v_row;
end;
$$;
revoke execute on function public.record_deadline_renewal(uuid, text, date, uuid) from public, anon;
grant execute on function public.record_deadline_renewal(uuid, text, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fin des travaux : renouvellement photographié exigé, photo du nouveau contrôle technique
-- acceptée comme photo du contrôle technique (le reste inchangé)
-- ---------------------------------------------------------------------------
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
  v_renewals text[];
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
                     where repair_order_id = p_repair_order_id and label in ('Contrôle technique', 'Nouveau contrôle technique')) then
    v_missing := v_missing || 'Photo du contrôle technique obligatoire'::text;
  end if;

  if v_inspection #>> '{controles,hayon}' = 'HS'
     and not exists (select 1 from public.ro_photos
                     where repair_order_id = p_repair_order_id and label = 'Étiquette contrôle hayon') then
    v_missing := v_missing || 'Photo de l’étiquette contrôle hayon obligatoire (HS)'::text;
  end if;

  -- Échéance renouvelée sur l'OR (contrôle technique, hayon, antipollution, extincteurs) :

  -- la nouvelle étiquette doit être photographiée et sa date enregistrée.

  select array_agg(public.deadline_kind_label(k) order by k) into v_renewals

  from unnest(public.repair_order_renewal_kinds(p_repair_order_id)) as k

  where not exists (select 1 from public.vehicle_deadline_renewals r

                    where r.repair_order_id = p_repair_order_id and r.kind = k);

  if v_renewals is not null then

    v_missing := v_missing || format('Photo de la nouvelle étiquette obligatoire : %s',

                                     lower(array_to_string(v_renewals, ', ')));

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
