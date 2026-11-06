-- =============================================================================
-- Dépannage extérieur : ce que le client signe indique le lieu et le prix du déplacement
--
-- Le déplacement n'était calculé qu'à la facture (build_invoice_draft) : ni le lien de signature,
-- ni la borne, ni le devis ne le montraient. Désormais :
--   * le lien et la borne reçoivent le lieu et le prix (`roadside`), pour l'OR comme pour le devis ;
--   * le devis issu de l'OR reçoit une ligne de déplacement, une seule même s'il est repris.
-- Facturation inchangée : la ligne du devis n'est pas reprise sur l'OR issu du devis, c'est l'OR de
-- dépannage qui facture le déplacement, une seule fois.
-- =============================================================================

-- OR : lieu et prix calculé (même règle que la facture). null si l'OR n'est pas un dépannage.
create function public.roadside_summary(p_repair_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('address', r.roadside_address, 'label', t.label, 'price', t.price)
  from public.repair_orders r
  cross join lateral public.roadside_travel(r.roadside_km, r.roadside_minutes, r.roadside_price_ht) t
  where r.id = p_repair_order_id and r.intervention_type = 'roadside';
$$;
revoke execute on function public.roadside_summary(uuid) from public, anon, authenticated;

-- Devis : lieu de l'OR, prix de la ligne de déplacement (modifiable, ou retirée : pas de prix affiché)
create function public.quote_roadside_summary(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('address', r.roadside_address, 'label', split_part(l.description, ' · ', 1), 'price', l.net_ht)
  from public.quotes q
  join public.repair_orders r on r.id = q.repair_order_id and r.intervention_type = 'roadside'
  left join lateral (
    select description, net_ht from public.quote_lines
    where quote_id = q.id and line_type = 'travel'
    order by position
    limit 1
  ) l on true
  where q.id = p_quote_id;
$$;
revoke execute on function public.quote_roadside_summary(uuid) from public, anon, authenticated;

-- Dernières versions des fonctions : on remplace, et on s'arrête si le texte a changé.
create function pg_temp.patch_function(p_function regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_function);
begin
  if position(p_old in v_def) = 0 then
    raise exception 'Texte introuvable dans % : %', p_function, p_old;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- Devis de l'OR : ligne de déplacement, ajoutée s'il n'y en a pas
select pg_temp.patch_function(
  'public.build_quote_from_repair_order(uuid)',
  $old$  update public.quotes set status = 'in_progress'$old$,
  $new$  -- Déplacement du dépannage : une ligne avec le lieu, comme à la facture
  if v_ro.intervention_type = 'roadside'
     and not exists (select 1 from public.quote_lines where quote_id = v_quote_id and line_type = 'travel') then
    insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity,
                                    discount_percent, vat_rate)
    select v_quote_id, 'planned',
           coalesce((select max(position) + 1 from public.quote_lines
                     where quote_id = v_quote_id and section = 'planned'), 0),
           'travel', t.label || coalesce(' · ' || nullif(v_ro.roadside_address, ''), ''), t.price, 1, v_discount, v_vat
    from public.roadside_travel(v_ro.roadside_km, v_ro.roadside_minutes, v_ro.roadside_price_ht) t
    where t.price is not null;
  end if;

  update public.quotes set status = 'in_progress'$new$);

-- OR issu du devis : le déplacement n'est pas une tâche du technicien
select pg_temp.patch_function(
  'public.create_repair_order_from_quote(uuid, uuid, date, time, time, boolean)',
  $old$and line_type not in ('text', 'consumable', 'part')$old$,
  $new$and line_type not in ('text', 'consumable', 'part', 'travel')$new$);

-- Borne : OR et devis
select pg_temp.patch_function(
  'public.kiosk_pending_signature()',
  $old$'total_ttc', v_quote.total_ttc,$old$,
  $new$'total_ttc', v_quote.total_ttc,
      'roadside', public.quote_roadside_summary(v_request.quote_id),$new$);
select pg_temp.patch_function(
  'public.kiosk_pending_signature()',
  $old$'requested_work', v_ro.requested_work);$old$,
  $new$'requested_work', v_ro.requested_work,
    'roadside', public.roadside_summary(v_ro.id));$new$);

-- Lien à distance : OR et devis
select pg_temp.patch_function(
  'public.public_find_document(text)',
  $old$'requested_work', v_ro.requested_work,$old$,
  $new$'requested_work', v_ro.requested_work,
      'roadside', public.roadside_summary(v_ro.id),$new$);
select pg_temp.patch_function(
  'public.public_find_document(text)',
  $old$'vehicle_plate', (select plate from public.vehicles where id = v_quote.vehicle_id),$old$,
  $new$'vehicle_plate', (select plate from public.vehicles where id = v_quote.vehicle_id),
      'roadside', public.quote_roadside_summary(v_quote.id),$new$);

drop function pg_temp.patch_function(regprocedure, text, text);
