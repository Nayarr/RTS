-- =============================================================================
-- Pièces : catalogue mis à jour ou complété à chaque ajout, marge sur le prix d'achat
-- =============================================================================
-- - Même désignation, même référence et même marque : la pièce du catalogue est reprise (ses prix
--   sont mis à jour) ; un seul des trois change : nouvelle pièce.
-- - Marge = (vente HT - achat HT) / achat HT ; les frais de port restent facturés à part.

create or replace function public.find_catalog_part(p_designation text, p_manufacturer_ref text, p_brand text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select id from public.parts
  where lower(btrim(designation)) = lower(btrim(coalesce(p_designation, '')))
    and lower(btrim(coalesce(manufacturer_ref, ''))) = lower(btrim(coalesce(p_manufacturer_ref, '')))
    and lower(btrim(coalesce(brand, ''))) = lower(btrim(coalesce(p_brand, '')))
  order by is_active desc, updated_at desc
  limit 1;
$$;
revoke execute on function public.find_catalog_part(text, text, text) from public, anon;
grant execute on function public.find_catalog_part(text, text, text) to authenticated;

create index parts_designation_key_idx on public.parts (lower(btrim(designation)));

create or replace function public.part_sale_price(
  p_purchase numeric, p_shipping numeric, p_kind public.margin_kind, p_margin numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  -- Marge sur le prix d'achat seul (frais de port facturés à part)
  select case
    when p_purchase is null or p_margin is null then null
    when p_kind = 'amount' then round(p_purchase + p_margin, 2)
    else round(p_purchase * (1 + p_margin / 100), 2)
  end;
$$;

-- Prix de vente saisi : gardé tel quel (la marge n'est qu'un repère) ; sinon calculé depuis la marge
create or replace function public.parts_compute_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sale_price is null and new.margin_value is not null and new.purchase_price is not null then
    new.sale_price := public.part_sale_price(new.purchase_price, new.shipping_cost, new.margin_kind, new.margin_value);
  end if;
  return new;
end;
$$;

-- Pièces existantes : prix de vente inchangés, marge recalculée avec la nouvelle formule
-- (sans recalcul du prix par le déclencheur : aucun centime d'arrondi)
alter table public.parts disable trigger parts_compute_sale_price;
update public.parts
   set margin_kind = 'percent',
       margin_value = round((sale_price - purchase_price) / purchase_price * 100, 2)
 where purchase_price > 0 and sale_price is not null;
update public.parts set margin_value = null
 where (purchase_price is null or purchase_price = 0) and margin_value is not null;
alter table public.parts enable trigger parts_compute_sale_price;
