-- Travaux réalisés avant le devis : le bureau garde la main sur chaque ligne, même au-delà d'1 h d'expertise.
-- La première heure reste offerte par défaut, mais chaque ligne de main-d'œuvre peut être :
--   * facturée avec sa part de la 1re heure offerte (défaut) ;
--   * facturée en entier (1re heure repassée en payante) : "first_hour": false ;
--   * offerte en entier (geste commercial).
-- p_decisions : [{ "line_id": uuid, "decision": "billed" | "offered", "price": nombre, "first_hour": booléen }]
-- Sans décision pour une ligne de l'expertise, l'ancien comportement s'applique (1re heure offerte).

do $migration$
declare
  v_def text := pg_get_functiondef('public.pre_quote_work(uuid)'::regprocedure);
  v_old text := $old$                'offered_hours', s.offered_hours, 'billed_hours', s.billed_hours,$old$;
  v_new text := $new$                'offered_hours', s.offered_hours, 'billed_hours', s.billed_hours,
                -- Prix de la ligne entière : facturée sans heure offerte, ou valeur du geste commercial
                'full_price', round(s.suggested_price, 2),$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans pre_quote_work : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

do $migration$
declare
  v_def text := pg_get_functiondef('public.settle_pre_quote_work(uuid, jsonb)'::regprocedure);
  v_old text;
  v_new text;
begin
  v_old := $old$  select coalesce(jsonb_agg(jsonb_build_object(
           'line_id', s.id, 'description', s.description, 'ord', s.ord,
           'forced', v_rule and s.is_labor,
           'decision', case when v_rule and s.is_labor
                            then case when s.billed_hours > 0 then 'billed' else 'offered' end
                            else d.decision::text end,
           'price', case when v_rule and s.is_labor
                         then case when s.billed_hours > 0
                                   then coalesce(d.price, round(s.suggested_price * s.billed_hours / s.hours, 2))
                                   else round(s.suggested_price, 2) end
                         -- Offert sans prix saisi : prix proposé (valeur du geste visible sur la facture)
                         else coalesce(d.price, case when d.decision = 'offered' then round(s.suggested_price, 2) end) end,
           'offered_price', case when v_rule and s.is_labor and s.offered_hours > 0 and s.billed_hours > 0
                                 then round(s.suggested_price * s.offered_hours / s.hours, 2) end)
           order by s.ord), '[]'::jsonb)
    into v_rows
  from public.pre_quote_work_split(p_repair_order_id) s
  left join jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
         as d(line_id uuid, decision public.done_line_decision, price numeric) on d.line_id = s.id;
$old$;
  v_new := $new$  -- k.first_hour : la ligne garde sa part de la 1re heure offerte (défaut, sauf "first_hour": false).
  -- k.decision : celle du bureau ; sans décision, celle de la règle (1re heure offerte, le reste facturé).
  -- k.hour_used : la 1re heure offerte s'applique vraiment (part facturée et part offerte, ou ligne
  -- entièrement dans la 1re heure et offerte).
  select coalesce(jsonb_agg(jsonb_build_object(
           'line_id', s.id, 'description', s.description, 'ord', s.ord,
           'forced', k.hour_used and k.decision = 'offered',
           'hour_used', k.hour_used,
           'decision', k.decision,
           'price', coalesce(d.price,
                             case when k.hour_used and k.decision = 'billed'
                                    then round(s.suggested_price * s.billed_hours / s.hours, 2)
                                  -- Offert sans prix saisi : prix proposé (valeur du geste visible sur la facture)
                                  when k.decision = 'offered' or (v_rule and s.is_labor)
                                    then round(s.suggested_price, 2) end),
           'offered_price', case when k.hour_used and k.decision = 'billed'
                                 then round(s.suggested_price * s.offered_hours / s.hours, 2) end)
           order by s.ord), '[]'::jsonb)
    into v_rows
  from public.pre_quote_work_split(p_repair_order_id) s
  left join jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
         as d(line_id uuid, decision public.done_line_decision, price numeric, first_hour boolean)
    on d.line_id = s.id
  cross join lateral (
    select v_rule and s.is_labor and s.offered_hours > 0 and coalesce(d.first_hour, true) as first_hour,
           coalesce(d.decision::text,
                    case when v_rule and s.is_labor
                         then case when s.billed_hours > 0 then 'billed' else 'offered' end end) as decision
  ) k0
  cross join lateral (
    select k0.decision,
           k0.first_hour and ((k0.decision = 'billed' and s.billed_hours > 0)
                              or (k0.decision = 'offered' and s.billed_hours = 0)) as hour_used
  ) k;
  -- Mention « 1re heure offerte » seulement si elle est appliquée sur au moins une ligne
  v_rule := exists (select 1 from jsonb_array_elements(v_rows) r where (r ->> 'hour_used')::boolean);
$new$;
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans settle_pre_quote_work : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
