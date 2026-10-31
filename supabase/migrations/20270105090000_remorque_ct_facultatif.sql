-- =============================================================================
-- Remorques : photo du contrôle technique facultative pour terminer l'OR
--
-- Demande du client : une remorque n'a pas besoin du contrôle technique dans l'OR ; la photo
-- reste possible, elle n'est plus exigée. Les autres véhicules ne changent pas.
-- =============================================================================

create or replace function public.complete_repair_order(p_repair_order_id uuid, p_quote_needed boolean DEFAULT false)
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
$$;
