-- Travaux réalisés avant le devis : facture en brouillon, et plus de fenêtre pour un devis fait avant tout travail.
--
-- 1) La décision (facturer / offrir chaque travail) prépare un BROUILLON de facture, plus une facture émise :
--    la direction y offre ou retire elle-même la ligne « Fournitures et recyclage » (ajoutée à toute nouvelle
--    facture), relit, puis émet et envoie quand elle le décide. Rien n'est envoyé au client automatiquement.
--    Brouillon supprimé : la décision est à reprendre (la fenêtre revient).
-- 2) Devis fait sur un OR avant tout travail : les tâches de l'OR sont des « travaux effectués » sans temps
--    dès sa création ; une fois le devis accepté, la fenêtre « Travaux réalisés avant le devis » s'ouvrait à
--    tort. Elle n'apparaît plus que si l'OR a vraiment travaillé avant le devis (badgeage commencé avant le
--    devis, travaux terminés avant le devis ou OR en « Devis à faire »), et seulement pour les lignes qui ont
--    un temps ou un prix.

-- ---------------------------------------------------------------------------
-- 1) Brouillon de facture au lieu d'une facture émise
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_def text := pg_get_functiondef('public.settle_pre_quote_work(uuid, jsonb)'::regprocedure);
  v_new text := v_def;
  v_pairs text[][] := array[
    array[$o$  -- Facture émise dans tous les cas, même tout offert : le client voit le geste commercial.$o$,
          $n$  -- Brouillon de facture dans tous les cas, même tout offert : le client verra le geste commercial.
  -- La direction le relit (Fournitures et recyclage offertes ou retirées à la main), puis l'émet elle-même.$n$],
    array[$o$
    v_number := public.issue_invoice(v_invoice_id);
  end;$o$,
          $n$
  end;$n$],
    array[$o$            || ' (facture ' || v_number || ')',$o$,
          $n$            || ' (brouillon de facture à émettre)',$n$]
  ];
  v_i integer;
begin
  for v_i in 1 .. array_length(v_pairs, 1) loop
    if position(v_pairs[v_i][1] in v_new) = 0 then
      raise exception 'Texte introuvable dans settle_pre_quote_work : %', v_pairs[v_i][1];
    end if;
    v_new := replace(v_new, v_pairs[v_i][1], v_pairs[v_i][2]);
  end loop;
  execute v_new;
end;
$migration$;

-- Brouillon supprimé : la décision sur les travaux avant devis est à reprendre
create function public.invoices_reopen_pre_quote_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft' then
    return old;
  end if;
  perform set_config('rts.system', 'on', true);
  update public.repair_orders r
     set pre_quote_work_settled_at = null
    from public.invoice_repair_orders iro
   where iro.invoice_id = old.id
     and r.id = iro.repair_order_id
     and r.pre_quote_work_settled_at is not null
     -- Brouillon des travaux avant devis : ses lignes viennent des travaux effectués de l'OR
     and exists (select 1 from public.invoice_lines il join public.ro_lines l on l.id = il.source_ro_line_id
                 where il.invoice_id = old.id and l.repair_order_id = r.id and l.kind = 'done')
     and public.active_invoice_number(r.id, old.id) is null;
  perform set_config('rts.system', '', true);
  return old;
end;
$$;
revoke execute on function public.invoices_reopen_pre_quote_work() from public, anon, authenticated;
create trigger invoices_reopen_pre_quote_work
  before delete on public.invoices
  for each row execute function public.invoices_reopen_pre_quote_work();

-- ---------------------------------------------------------------------------
-- 2) Pas de fenêtre pour un devis fait avant tout travail
-- ---------------------------------------------------------------------------
-- Une ligne de travaux effectués compte comme faite avant le devis (dernier devis accepté de l'OR) si :
--   - elle a un temps ou un prix (une tâche jamais commencée n'en a pas) ;
--   - elle existait déjà quand le devis a été créé ;
--   - le devis ne l'a pas reprise vide : un devis préparé depuis l'OR recopie ses travaux effectués avec
--     leur temps du moment ; une tâche recopiée sans temps ni prix n'était pas encore faite ;
--   - devis qui ne l'a pas reprise : l'OR avait travaillé avant le devis (badgeage commencé avant lui,
--     travaux terminés avant lui, ou OR en « Devis à faire », passé en « Facture à faire » à l'accord).
do $migration$
declare
  v_def text := pg_get_functiondef('public.pre_quote_work_lines(uuid)'::regprocedure);
  v_new text;
  v_pairs text[][] := array[
    array[$o$  join public.repair_orders r on r.id = l.repair_order_id
$o$,
          $n$  join public.repair_orders r on r.id = l.repair_order_id
  left join lateral (
    select q.id, q.created_at from public.quotes q
    where q.repair_order_id = r.id and q.status = 'accepted'
    order by q.accepted_at desc nulls last limit 1
  ) q on true
$n$],
    array[$o$    and l.line_type not in ('text', 'part') and btrim(l.description) <> ''$o$,
          $n$    and l.line_type not in ('text', 'part') and btrim(l.description) <> ''
    -- Temps ou prix : une tâche jamais commencée n'en a pas
    and (coalesce(h.hours, 0) > 0 or coalesce(l.unit_price, 0) > 0)
    -- Travail déjà là quand le devis a été fait
    and (q.id is null or l.created_at <= q.created_at)
    -- Reprise vide par le devis : la tâche n'était pas encore faite
    and not exists (
      select 1 from public.quote_lines qd
      where qd.quote_id = q.id and qd.section = 'done' and qd.source_ro_line_id = l.id
        and coalesce(nullif(qd.billed_hours, 0), nullif(qd.standard_hours, 0), nullif(qd.estimated_hours, 0)) is null
        and coalesce(qd.unit_price, 0) = 0)
    -- Pas reprise par le devis : l'OR avait travaillé avant lui
    and (q.id is null
         or exists (select 1 from public.quote_lines qd
                    where qd.quote_id = q.id and qd.section = 'done' and qd.source_ro_line_id = l.id)
         or r.status in ('quote_pending', 'to_invoice')
         or (r.completed_at is not null and r.completed_at <= q.created_at)
         or exists (select 1 from public.time_entries t
                    where t.repair_order_id = r.id and t.started_at < q.created_at))$n$]
  ];
  v_i integer;
begin
  v_new := v_def;
  for v_i in 1 .. array_length(v_pairs, 1) loop
    if position(v_pairs[v_i][1] in v_new) = 0 then
      raise exception 'Texte introuvable dans pre_quote_work_lines : %', v_pairs[v_i][1];
    end if;
    v_new := replace(v_new, v_pairs[v_i][1], v_pairs[v_i][2]);
  end loop;
  execute v_new;
end;
$migration$;
