-- =============================================================================
-- RTS Atelier : Facturation (bureau)
--   - liste des factures (brouillons et émises) avec reste dû et OR concernés ;
--   - paiement plafonné au reste dû.
-- =============================================================================

create view public.v_invoices_overview
with (security_invoker = on) as
select
  i.id,
  i.number,
  i.status,
  i.client_id,
  coalesce(i.client_name, c.name) as client_name,
  i.client_address,
  i.client_siren,
  i.vehicle_label,
  i.mileage,
  i.service_date,
  i.issued_at,
  i.due_date,
  i.public_token,
  i.created_at,
  t.total_ht,
  t.total_vat,
  t.total_ttc,
  b.paid_ttc,
  b.credited_ttc,
  b.balance_due,
  b.payment_status,
  b.last_paid_on,
  coalesce(ro.ids, '{}') as repair_order_ids,
  coalesce(ro.numbers, '{}') as repair_order_numbers
from public.invoices i
left join public.clients c on c.id = i.client_id
join public.v_invoice_totals t on t.invoice_id = i.id
left join public.v_invoice_balances b on b.invoice_id = i.id
left join lateral (
  select array_agg(r.id order by r.number) as ids, array_agg(r.number order by r.number) as numbers
  from public.invoice_repair_orders iro
  join public.repair_orders r on r.id = iro.repair_order_id
  where iro.invoice_id = i.id
) ro on true;

revoke all on public.v_invoices_overview from public, anon;
grant select on public.v_invoices_overview to authenticated;

-- Un encaissement ne dépasse pas le reste dû (erreur de saisie : 1 500 au lieu de 150).
create or replace function public.payments_not_above_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  if public.is_migration_context() then
    return new;
  end if;
  select balance_due into v_balance from public.v_invoice_balances where invoice_id = new.invoice_id;
  if new.amount_ttc > coalesce(v_balance, 0) + 0.01 then
    raise exception 'Le paiement dépasse le reste dû (% €)', to_char(coalesce(v_balance, 0), 'FM999999990.00')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.payments_not_above_balance() from public, anon, authenticated;

create trigger payments_not_above_balance
  before insert on public.payments
  for each row execute function public.payments_not_above_balance();
