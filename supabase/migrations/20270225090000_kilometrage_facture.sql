-- Kilométrage sur la facture (page, PDF, facture en ligne du client).
-- La facture prenait le kilométrage de l'OR à la création du brouillon : un kilométrage saisi ensuite par
-- le technicien (ou corrigé par le bureau) n'y arrivait jamais, la facture partait sans kilométrage.
-- - Brouillon : il suit le kilométrage de son OR à chaque changement.
-- - Émission : le kilométrage de l'OR (facture d'un seul OR) est repris, sinon celui du brouillon.

do $migration$
declare
  v_def text := pg_get_functiondef('public.issue_invoice'::regproc);
  v_old text := $old$    service_date = coalesce(service_date, v_today),$old$;
  v_new text := $new$    service_date = coalesce(service_date, v_today),
    -- Kilométrage de l'OR au moment de l'émission (facture d'un seul OR)
    mileage = coalesce((select max(r.mileage) from public.repair_orders r
                        join public.invoice_repair_orders iro on iro.repair_order_id = r.id
                        where iro.invoice_id = p_invoice_id
                        having count(*) = 1), mileage),$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans issue_invoice : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

-- Kilométrage de l'OR modifié : ses brouillons de facture (d'un seul OR) suivent
create function public.repair_orders_mileage_to_drafts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoices i
     set mileage = new.mileage
   where i.status = 'draft'
     and i.mileage is distinct from new.mileage
     and exists (select 1 from public.invoice_repair_orders iro
                 where iro.invoice_id = i.id and iro.repair_order_id = new.id)
     and (select count(*) from public.invoice_repair_orders iro where iro.invoice_id = i.id) = 1;
  return null;
end;
$$;
revoke execute on function public.repair_orders_mileage_to_drafts() from public, anon, authenticated;

create trigger repair_orders_mileage_to_drafts
  after update of mileage on public.repair_orders
  for each row when (new.mileage is distinct from old.mileage)
  execute function public.repair_orders_mileage_to_drafts();

-- Brouillons déjà créés sans kilométrage : repris de leur OR
update public.invoices i
   set mileage = r.mileage
  from public.invoice_repair_orders iro
  join public.repair_orders r on r.id = iro.repair_order_id
 where iro.invoice_id = i.id and i.status = 'draft' and i.mileage is null and r.mileage is not null
   and (select count(*) from public.invoice_repair_orders x where x.invoice_id = i.id) = 1;
