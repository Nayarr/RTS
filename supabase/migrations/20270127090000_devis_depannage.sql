-- =============================================================================
-- Dépannage extérieur choisi sur le devis
--
-- Le devis peut porter lui-même le lieu, le trajet et le prix du déplacement, même sans OR :
--   * set_quote_roadside enregistre ces champs et tient à jour sa ligne de déplacement ;
--   * l'OR créé depuis le devis (ou qui le reprend) devient un dépannage et facture le déplacement ;
--   * un devis dont l'OR est déjà un dépannage reste réglé par cet OR, qui le facture une seule fois.
-- =============================================================================

alter table public.quotes
  add column roadside_address text,
  add column roadside_km numeric(8,1) check (roadside_km >= 0),
  add column roadside_minutes integer check (roadside_minutes >= 0),
  add column roadside_price_ht numeric(10,2) check (roadside_price_ht >= 0);
comment on column public.quotes.roadside_address is
  'Dépannage choisi sur le devis : lieu d''intervention (null : pas de dépannage porté par le devis).';
comment on column public.quotes.roadside_km is 'Dépannage du devis : distance aller-retour depuis l''atelier (km).';
comment on column public.quotes.roadside_minutes is 'Dépannage du devis : temps de trajet aller-retour (minutes).';
comment on column public.quotes.roadside_price_ht is
  'Dépannage du devis : prix du déplacement saisi à la main (au-delà de la zone 3, ou à la place du calcul), € HT.';

-- Pose (ou retire, lieu vide) le dépannage du devis et sa ligne de déplacement.
create function public.set_quote_roadside(
  p_quote_id uuid,
  p_address text,
  p_km numeric,
  p_minutes integer,
  p_price numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_travel record;
  v_discount numeric;
  v_vat numeric;
begin
  perform public.assert_billing();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_quote.status = 'accepted' or v_quote.merged_into_repair_order_id is not null then
    raise exception 'Ce devis ne peut plus être modifié' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.repair_orders
             where id = v_quote.repair_order_id and intervention_type = 'roadside') then
    raise exception 'Ce dépannage se modifie sur la fiche de l''OR' using errcode = 'P0001';
  end if;

  if v_address is null then
    update public.quotes
       set roadside_address = null, roadside_km = null, roadside_minutes = null, roadside_price_ht = null
     where id = p_quote_id;
    delete from public.quote_lines where quote_id = p_quote_id and line_type = 'travel';
    return;
  end if;

  if p_km is null or p_minutes is null then
    raise exception 'Indique la distance et le temps de trajet aller-retour' using errcode = '22023';
  end if;
  select * into v_travel from public.roadside_travel(p_km, p_minutes, p_price);
  if v_travel.price is null then
    raise exception 'Au-delà de la zone 3 : indique le prix du déplacement' using errcode = '22023';
  end if;

  update public.quotes
     set roadside_address = v_address, roadside_km = p_km, roadside_minutes = p_minutes, roadside_price_ht = p_price
   where id = p_quote_id;

  update public.quote_lines
     set description = v_travel.label || ' · ' || v_address, unit_price = v_travel.price
   where quote_id = p_quote_id and line_type = 'travel';
  if not found then
    select coalesce(discount_percent, 0) into v_discount from public.clients where id = v_quote.client_id;
    select default_vat_rate into v_vat from public.company_settings;
    insert into public.quote_lines (quote_id, section, position, line_type, description, unit_price, quantity,
                                    discount_percent, vat_rate)
    values (p_quote_id, 'planned',
            coalesce((select max(position) + 1 from public.quote_lines
                      where quote_id = p_quote_id and section = 'planned'), 0),
            'travel', v_travel.label || ' · ' || v_address, v_travel.price, 1, coalesce(v_discount, 0), v_vat);
  end if;
end;
$$;
revoke execute on function public.set_quote_roadside(uuid, text, numeric, integer, numeric) from public, anon;
grant execute on function public.set_quote_roadside(uuid, text, numeric, integer, numeric) to authenticated;

-- Lieu du devis, sinon celui de son OR ; prix de la ligne de déplacement
create or replace function public.quote_roadside_summary(p_quote_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('address', coalesce(q.roadside_address, r.roadside_address),
                            'label', split_part(l.description, ' · ', 1), 'price', l.net_ht)
  from public.quotes q
  left join public.repair_orders r on r.id = q.repair_order_id and r.intervention_type = 'roadside'
  left join lateral (
    select description, net_ht from public.quote_lines
    where quote_id = q.id and line_type = 'travel'
    order by position
    limit 1
  ) l on true
  where q.id = p_quote_id and (q.roadside_address is not null or r.id is not null);
$$;

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

-- OR créé depuis le devis : il reprend le dépannage du devis et le facturera
select pg_temp.patch_function(
  'public.create_repair_order_from_quote(uuid, uuid, date, time, time, boolean)',
  $old$  perform set_config('rts.system', 'on', true);$old$,
  $new$  -- Dépannage porté par le devis : cet OR le facturera (une seule ligne, à sa facture)
  if v_quote.roadside_address is not null then
    update public.repair_orders
       set intervention_type = 'roadside', roadside_address = v_quote.roadside_address,
           roadside_km = v_quote.roadside_km, roadside_minutes = v_quote.roadside_minutes,
           roadside_price_ht = v_quote.roadside_price_ht
     where id = v_ro_id;
  end if;

  perform set_config('rts.system', 'on', true);$new$);

-- Devis rattaché à un OR : l'OR reprend le dépannage, sauf s'il en a déjà un
select pg_temp.patch_function(
  'public.merge_quote_into_repair_order(uuid, uuid)',
  $old$  update public.quotes set merged_into_repair_order_id = p_repair_order_id where id = p_quote_id;$old$,
  $new$  if v_quote.roadside_address is not null then
    update public.repair_orders
       set intervention_type = 'roadside', roadside_address = v_quote.roadside_address,
           roadside_km = v_quote.roadside_km, roadside_minutes = v_quote.roadside_minutes,
           roadside_price_ht = v_quote.roadside_price_ht
     where id = p_repair_order_id and intervention_type <> 'roadside';
  end if;

  update public.quotes set merged_into_repair_order_id = p_repair_order_id where id = p_quote_id;$new$);

-- Devis dupliqué : le dépannage suit sa ligne
select pg_temp.patch_function(
  'public.duplicate_quote(uuid)',
  $old$  insert into public.quote_lines (quote_id, section, position, line_type, description, quantity, unit_price,$old$,
  $new$  update public.quotes
     set roadside_address = v_quote.roadside_address, roadside_km = v_quote.roadside_km,
         roadside_minutes = v_quote.roadside_minutes, roadside_price_ht = v_quote.roadside_price_ht
   where id = v_id;

  insert into public.quote_lines (quote_id, section, position, line_type, description, quantity, unit_price,$new$);

drop function pg_temp.patch_function(regprocedure, text, text);
