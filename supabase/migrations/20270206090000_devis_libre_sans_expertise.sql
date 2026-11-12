-- Devis fait librement (sans OR), puis transformé en OR avant d'être accepté : l'OR naît du devis,
-- ses travaux effectués sont les lignes du devis. Rien n'a été fait « avant le devis » : à l'accord,
-- pas de fenêtre « Travaux réalisés avant le devis », et les prestations ne comptent pas comme expertise.
-- Le devis accepté est celui d'où vient l'OR (repair_orders.origin_quote_id).

do $migration$
declare
  v_def text := pg_get_functiondef('public.pre_quote_work(uuid)'::regprocedure);
  v_old text := $old$  if not found or exists (
    select 1 from public.invoice_repair_orders iro join public.invoices i on i.id = iro.invoice_id$old$;
  v_new text := $new$  -- OR créé depuis ce devis : ses travaux sont ceux du devis, rien n'a été fait avant
  if not found or v_quote.id is not distinct from v_ro.origin_quote_id or exists (
    select 1 from public.invoice_repair_orders iro join public.invoices i on i.id = iro.invoice_id$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans pre_quote_work : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
