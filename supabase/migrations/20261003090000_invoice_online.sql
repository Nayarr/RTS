-- =============================================================================
-- RTS Atelier : Envoi des factures en ligne et relances
-- =============================================================================

-- Relance d'une facture impayée : tracée (date, auteur) et visible dans l'historique des OR.
create or replace function public.record_invoice_reminder(p_invoice_id uuid)
returns public.invoice_reminders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_balance numeric;
  v_reminder public.invoice_reminders;
begin
  perform public.assert_office();
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'issued' then
    raise exception 'Seule une facture émise peut être relancée' using errcode = 'P0001';
  end if;
  select balance_due into v_balance from public.v_invoice_balances where invoice_id = p_invoice_id;
  if coalesce(v_balance, 0) <= 0.01 then
    raise exception 'Cette facture est soldée' using errcode = 'P0001';
  end if;

  insert into public.invoice_reminders (invoice_id, sent_by) values (p_invoice_id, auth.uid())
  returning * into v_reminder;

  insert into public.ro_events (repair_order_id, label, actor_id)
  select iro.repair_order_id,
         'Relance de la facture ' || v_invoice.number || ' (reste dû ' || to_char(v_balance, 'FM999999990.00') || ' €)',
         auth.uid()
  from public.invoice_repair_orders iro where iro.invoice_id = p_invoice_id;
  return v_reminder;
end;
$$;

revoke execute on function public.record_invoice_reminder(uuid) from public, anon;
grant execute on function public.record_invoice_reminder(uuid) to authenticated;

-- Liste des factures : relances ajoutées (en fin de vue, colonnes existantes inchangées).
create or replace view public.v_invoices_overview
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
  coalesce(ro.numbers, '{}') as repair_order_numbers,
  coalesce(rm.count, 0) as reminders_count,
  rm.last_sent_at as last_reminder_at
from public.invoices i
left join public.clients c on c.id = i.client_id
join public.v_invoice_totals t on t.invoice_id = i.id
left join public.v_invoice_balances b on b.invoice_id = i.id
left join lateral (
  select array_agg(r.id order by r.number) as ids, array_agg(r.number order by r.number) as numbers
  from public.invoice_repair_orders iro
  join public.repair_orders r on r.id = iro.repair_order_id
  where iro.invoice_id = i.id
) ro on true
left join lateral (
  select count(*) as count, max(sent_at) as last_sent_at
  from public.invoice_reminders where invoice_id = i.id
) rm on true;
