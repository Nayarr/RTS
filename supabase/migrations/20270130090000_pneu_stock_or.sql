-- =============================================================================
-- RTS Atelier : pneu du stock sur un OR
--
-- - Un pneu du stock (pièce d'un lot du module Pneumatiques) mis sur un OR n'est pas à commander :
--   la ligne arrive en « Reçue » quand le stock disponible suffit, et l'OR ne passe plus en
--   « pièce en attente ». Vaut pour le pneu repris d'un devis comme pour celui ajouté sur l'OR.
-- - Stock insuffisant : la ligne reste « À commander », comme avant.
-- - Rien ne change pour le stock : les pneus de l'OR sont réservés (le disponible baisse tout de
--   suite) et sortent du stock à l'émission de la facture.
-- =============================================================================

create function public.ro_lines_tire_in_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tire public.tires;
  v_reserved integer;
  v_from_quote numeric := 0;
begin
  if new.line_type <> 'part' or new.part_id is null
     or coalesce(new.order_status, 'to_order'::public.part_order_status) <> 'to_order' then
    return new;
  end if;
  select * into v_tire from public.tires where part_id = new.part_id;
  if not found then
    return new;
  end if;

  select coalesce(sum(r.reserved), 0)::integer into v_reserved
  from public.tire_reserved_quantities(v_tire.line_id) r
  where r.tire_id = v_tire.id;

  -- Ligne reprise d'un devis : ses pneus sont encore comptés comme réservés par le devis
  if new.source_quote_line_id is not null then
    select coalesce(sum(ql.quantity), 0) into v_from_quote
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id
    where ql.id = new.source_quote_line_id
      and ql.part_id = new.part_id
      and q.status in ('draft', 'in_progress', 'sent', 'accepted')
      and ql.source_ro_line_id is null
      and coalesce(ql.done_line_decision, 'billed') = 'billed'
      and not exists (select 1 from public.invoice_lines il where il.source_quote_line_id = ql.id);
  end if;

  if v_tire.stock_qty - v_reserved + v_from_quote >= new.quantity then
    new.order_status := 'received';
  end if;
  return new;
end;
$$;

comment on function public.ro_lines_tire_in_stock() is
  'Pneu du stock mis sur un OR : « Reçue » quand le stock disponible suffit (pas de pièce en attente).';
revoke execute on function public.ro_lines_tire_in_stock() from public, anon, authenticated;

create trigger tire_in_stock before insert on public.ro_lines
  for each row execute function public.ro_lines_tire_in_stock();
