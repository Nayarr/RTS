-- =============================================================================
-- RTS Atelier : correction du kilométrage saisi par le technicien
--
-- - La direction corrige le kilométrage d'un OR même facturé : c'est la seule donnée de l'OR
--   facturé qui change encore (le reste est verrouillé par la facture, comme avant).
-- - La facture encore en brouillon de cet OR (seul) reprend le kilométrage corrigé. Une facture émise
--   garde le sien : c'est une pièce comptable, on ne la modifie pas.
-- - Chaque changement de kilométrage est noté dans l'historique de l'OR (« 123 456 → 124 456 km »).
-- =============================================================================

-- OR facturé : la direction peut encore corriger le kilométrage
do $migration$
declare
  v_def text := pg_get_functiondef('public.repair_orders_invoiced_lock()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'if (to_jsonb(new) - v_auto) is not distinct from (to_jsonb(old) - v_auto) then',
    '-- Kilométrage corrigé par la direction : seule donnée qui change encore
  if public.is_direction() then
    v_auto := v_auto || array[''mileage''];
  end if;
  if (to_jsonb(new) - v_auto) is not distinct from (to_jsonb(old) - v_auto) then');
  if v_new = v_def then
    raise exception 'repair_orders_invoiced_lock : texte attendu introuvable, migration à revoir';
  end if;
  execute v_new;
end;
$migration$;

-- Historique de l'OR et facture en brouillon mis au kilométrage corrigé
create function public.repair_orders_mileage_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_migration_context() then
    return null;
  end if;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (new.id,
          'Kilométrage : ' || coalesce(replace(to_char(old.mileage, 'FM999,999,999'), ',', ' ') || ' km', 'non renseigné')
            || ' → ' || coalesce(replace(to_char(new.mileage, 'FM999,999,999'), ',', ' ') || ' km', 'non renseigné'),
          auth.uid());
  -- Facture à émettre de cet OR seul (une facture groupée n'a pas de kilométrage)
  update public.invoices i
     set mileage = new.mileage
   where i.status = 'draft'
     and exists (select 1 from public.invoice_repair_orders iro
                 where iro.invoice_id = i.id and iro.repair_order_id = new.id)
     and (select count(*) from public.invoice_repair_orders iro where iro.invoice_id = i.id) = 1;
  return null;
end;
$$;

comment on function public.repair_orders_mileage_changed() is
  'Kilométrage de l''OR changé : noté dans l''historique, repris par la facture encore en brouillon.';
revoke execute on function public.repair_orders_mileage_changed() from public, anon, authenticated;

create trigger mileage_changed after update of mileage on public.repair_orders
  for each row when (new.mileage is distinct from old.mileage)
  execute function public.repair_orders_mileage_changed();
