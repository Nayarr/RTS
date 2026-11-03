-- =============================================================================
-- Pièces : une référence constructeur, plusieurs références fabricant / fournisseur
--
-- Chaque référence fabricant ou fournisseur garde sa fiche (ses prix, sa marque) ; les fiches de même
-- référence constructeur forment une seule pièce dans le stock et la recherche.
-- - Comparaison sans casse ni séparateurs : « 5010-477 842 » et « 5010477842 » sont la même référence.
-- - Fiche modifiée depuis un devis, une facture ou un OR : mêmes désignation, références, marque et
--   fournisseur → seuls les prix sont mis à jour ; sinon nouvelle fiche, l'ancienne ne change pas.
-- - Recherche : une référence trouvée propose aussi ses équivalentes (même référence constructeur).
-- =============================================================================

alter table public.parts
  add column oem_key text generated always as (nullif(public.normalize_key(oem_ref), '')) stored,
  add column manufacturer_key text generated always as (nullif(public.normalize_key(manufacturer_ref), '')) stored;
comment on column public.parts.oem_ref is 'Référence constructeur : commune à toutes les références équivalentes.';
comment on column public.parts.manufacturer_ref is 'Référence fabricant ou fournisseur de cette fiche.';

create index parts_oem_key_idx on public.parts (oem_key) where is_active;
create index parts_manufacturer_key_idx on public.parts (manufacturer_key) where is_active;

drop function public.find_catalog_part(text, text, text);
create function public.find_catalog_part(
  p_designation text, p_manufacturer_ref text, p_brand text, p_oem_ref text, p_supplier_name text
)
returns uuid
language sql
stable
set search_path = ''
as $$
  select p.id
  from public.parts p
  left join public.suppliers s on s.id = p.supplier_id
  where not p.is_tire
    and lower(btrim(p.designation)) = lower(btrim(coalesce(p_designation, '')))
    and public.normalize_key(p.manufacturer_ref) = public.normalize_key(p_manufacturer_ref)
    and public.normalize_key(p.oem_ref) = public.normalize_key(p_oem_ref)
    and lower(btrim(coalesce(p.brand, ''))) = lower(btrim(coalesce(p_brand, '')))
    and lower(btrim(coalesce(s.name, ''))) = lower(btrim(coalesce(p_supplier_name, '')))
  order by p.is_active desc, p.updated_at desc
  limit 1;
$$;
revoke execute on function public.find_catalog_part(text, text, text, text, text) from public, anon;
grant execute on function public.find_catalog_part(text, text, text, text, text) to authenticated;

-- Recherche des pièces : désignation, marque, véhicule, fournisseur ou référence (sans séparateurs),
-- plus les références équivalentes de celles trouvées, regroupées par référence constructeur
create function public.search_parts(p_term text, p_limit integer default 200)
returns setof public.parts
language sql
stable
set search_path = ''
as $$
  with term as (
    select lower(btrim(coalesce(p_term, ''))) as text, public.normalize_key(p_term) as key
  ),
  found as (
    select p.id, p.oem_key
    from public.parts p
    left join public.suppliers s on s.id = p.supplier_id
    cross join term t
    where p.is_active and not p.is_tire
      and (
        t.text = ''
        or position(t.text in lower(p.designation)) > 0
        or position(t.text in lower(coalesce(p.brand, ''))) > 0
        or position(t.text in lower(coalesce(p.vehicle_ref, ''))) > 0
        or position(t.text in lower(coalesce(s.name, ''))) > 0
        or (t.key <> '' and (position(t.key in coalesce(p.manufacturer_key, '')) > 0
                             or position(t.key in coalesce(p.oem_key, '')) > 0))
      )
  )
  select p.*
  from public.parts p
  where p.is_active and not p.is_tire
    and (p.id in (select id from found)
         or p.oem_key in (select oem_key from found where oem_key is not null))
  order by case when p.oem_key is null then p.designation
                else min(p.designation) over (partition by p.oem_key) end,
           p.oem_key nulls last, p.designation, p.manufacturer_ref
  limit greatest(coalesce(p_limit, 200), 1);
$$;
revoke execute on function public.search_parts(text, integer) from public, anon;
grant execute on function public.search_parts(text, integer) to authenticated;
