-- =============================================================================
-- Recherche de pièce par référence, avec ou sans espaces
--
-- « Rx9767 BF », « RX9767BF » et « rx-9767.bf » trouvent la même pièce : la saisie et les références
-- sont comparées sans casse, espaces, tirets, points ni barres (normalize_key).
-- Les références fabricant et constructeur l'étaient déjà ; une saisie qui ressemble à une référence
-- (au moins un chiffre) est aussi cherchée ainsi dans la désignation et la référence véhicule, où les
-- pièces reprises de l'ancienne application ont souvent leur référence.
-- La recherche par nom ne change pas : texte contenu dans la désignation, la marque, le véhicule ou
-- le fournisseur.
-- =============================================================================

create or replace function public.search_parts(p_term text, p_limit integer default 200)
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
        or (t.key ~ '[0-9]' and (position(t.key in public.normalize_key(p.designation)) > 0
                                 or position(t.key in public.normalize_key(p.vehicle_ref)) > 0))
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
