-- Devis accepté → OR : la facture reprend le temps du devis, jamais le temps réel du mécano.
-- Une ligne de main d'œuvre du devis porte ses heures dans sa quantité (3 h = quantité 3) : l'OR
-- n'en reprenait rien (temps facturé vide), et la facture retombait sur le temps réel saisi par le
-- technicien (2 h). Le temps facturé de l'OR est désormais la quantité du devis ; la performance du
-- technicien (heures facturées) suit la facture.

do $migration$
declare
  v_def text := pg_get_functiondef('public.create_repair_order_from_quote'::regproc);
  v_old text := $old$         case when ql.line_type in ('labor', 'package')
              then coalesce(ql.billed_hours, ql.standard_hours, ql.estimated_hours) end,$old$;
  v_new text := $new$         -- (main d'œuvre : les heures acceptées par le client sont la quantité du devis)
         case when ql.line_type = 'labor'
              then coalesce(nullif(ql.quantity, 0), ql.billed_hours, ql.standard_hours, ql.estimated_hours)
              when ql.line_type = 'package'
              then coalesce(ql.billed_hours, ql.standard_hours, ql.estimated_hours) end,$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans create_repair_order_from_quote : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

-- OR déjà créés depuis un devis, pas encore facturés : temps du devis repris
select set_config('rts.system', 'on', true);
update public.ro_lines l
   set billed_hours = ql.quantity
  from public.quote_lines ql, public.repair_orders r
 where ql.id = l.source_quote_line_id
   and r.id = l.repair_order_id
   and r.status <> 'invoiced'
   and l.kind = 'done'
   and l.line_type = 'labor'
   and ql.line_type = 'labor'
   and l.billed_hours is null
   and ql.quantity > 0;
select set_config('rts.system', '', true);
