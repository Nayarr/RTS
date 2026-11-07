-- =============================================================================
-- Facture des travaux réalisés avant le devis : le déplacement du dépannage y figure
--
-- settle_pre_quote_work émet la facture de l'OR, qui passe en facturé : le brouillon de facture,
-- seul à ajouter le déplacement, n'était plus jamais construit pour cet OR. Le déplacement n'était
-- donc pas facturé. Même ligne que build_invoice_draft, dès que le prix est connu.
-- =============================================================================

do $$
declare
  v_def text := pg_get_functiondef('public.settle_pre_quote_work(uuid, jsonb)'::regprocedure);
  v_old text := 'v_number := public.issue_invoice(v_invoice_id);';
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans settle_pre_quote_work : %', v_old;
  end if;
  execute replace(v_def, v_old, $new$-- Déplacement du dépannage : une ligne, comme au brouillon de facture
    if v_ro.intervention_type = 'roadside' then
      insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price,
                                        quantity, discount_percent, vat_rate)
      select v_invoice_id, p_repair_order_id, 7000, 'travel',
             t.label || coalesce(' · ' || nullif(v_ro.roadside_address, ''), ''), t.price, 1,
             coalesce((select discount_percent from public.clients where id = v_ro.client_id), 0), v_vat
      from public.roadside_travel(v_ro.roadside_km, v_ro.roadside_minutes, v_ro.roadside_price_ht) t
      where t.price is not null;
    end if;

    v_number := public.issue_invoice(v_invoice_id);$new$);
end;
$$;
