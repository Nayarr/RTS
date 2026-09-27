-- =============================================================================
-- RTS Atelier — Catalogues : consommables (stock), pièces, fournisseurs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Stock des consommables : uniquement via le journal des mouvements
-- ---------------------------------------------------------------------------

-- Un stock modifié à la main n'aurait plus de trace : depuis l'appli, il part de 0 et ne
-- bouge que par mouvement (le trigger du journal, security definer, n'est pas concerné).
create or replace function public.consumables_stock_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_system_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.stock_qty := 0;
  elsif new.stock_qty is distinct from old.stock_qty then
    raise exception 'Le stock se corrige par un réapprovisionnement ou un inventaire' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.consumables_stock_guard() from public, anon, authenticated;

create trigger consumables_stock_guard
  before insert or update on public.consumables
  for each row execute function public.consumables_stock_guard();

-- Inventaire : fixe le stock compté, le journal garde l'écart. Renvoie le nouveau stock.
create or replace function public.set_consumable_stock(p_consumable_id uuid, p_quantity numeric, p_note text default null)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_current numeric;
begin
  if not public.is_direction() then
    raise exception 'Réservé à la direction' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'Stock invalide' using errcode = '22023';
  end if;

  select stock_qty into v_current from public.consumables where id = p_consumable_id for update;
  if not found then
    raise exception 'Consommable introuvable' using errcode = 'P0002';
  end if;

  if p_quantity <> v_current then
    insert into public.consumable_movements (consumable_id, quantity, reason, note, created_by)
    values (p_consumable_id, p_quantity - v_current, 'adjustment',
            coalesce(nullif(btrim(p_note), ''), 'Inventaire'), auth.uid());
  end if;
  return p_quantity;
end;
$$;

revoke execute on function public.set_consumable_stock(uuid, numeric, text) from public, anon;
grant execute on function public.set_consumable_stock(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fournisseurs : saisis par leur nom, créés à la volée
-- ---------------------------------------------------------------------------

create or replace function public.ensure_supplier(p_name text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  if public.normalize_key(coalesce(p_name, '')) = '' then
    raise exception 'Indique le fournisseur' using errcode = '22023';
  end if;

  select id into v_id from public.suppliers where name_key = public.normalize_key(p_name);
  if v_id is null then
    insert into public.suppliers (name) values (btrim(p_name))
    on conflict (name_key) do nothing
    returning id into v_id;
    -- Création simultanée par quelqu'un d'autre : on reprend la sienne.
    if v_id is null then
      select id into v_id from public.suppliers where name_key = public.normalize_key(p_name);
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function public.ensure_supplier(text) from public, anon;
grant execute on function public.ensure_supplier(text) to authenticated;

