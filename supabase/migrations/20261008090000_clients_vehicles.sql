-- =============================================================================
-- RTS Atelier — Fiches clients et véhicules
--   - remise et taux horaire d'un client : réservés à la direction ;
--   - carte grise d'un véhicule : fichier de la bonne catégorie, envoi confirmé ;
--   - vues de lecture : clients (véhicules, OR, dernière visite, CA, reste dû),
--     véhicules (client, passages, dernier kilométrage).
-- =============================================================================

-- Conditions commerciales du client : la direction seule les fixe.
create or replace function public.clients_pricing_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_direction()
     and (new.discount_percent, new.hourly_rate) is distinct from
         (case when tg_op = 'UPDATE' then old.discount_percent end, case when tg_op = 'UPDATE' then old.hourly_rate end) then
    raise exception 'Remise et taux horaire du client : réservés à la direction' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.clients_pricing_guard() from public, anon, authenticated;

create trigger clients_pricing_guard
  before insert or update on public.clients
  for each row execute function public.clients_pricing_guard();

-- Carte grise : photo de la bonne catégorie et envoi terminé.
create or replace function public.vehicles_registration_doc_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.registration_doc_file_id is distinct from
     (case when tg_op = 'UPDATE' then old.registration_doc_file_id end) then
    perform public.assert_confirmed_file(new.registration_doc_file_id, 'registration_doc');
  end if;
  return new;
end;
$$;

revoke execute on function public.vehicles_registration_doc_guard() from public, anon, authenticated;

create trigger vehicles_registration_doc_guard
  before insert or update on public.vehicles
  for each row execute function public.vehicles_registration_doc_guard();

-- Liste des clients : véhicules, OR, dernière visite, chiffre d'affaires et reste dû (factures émises).
create view public.v_clients_overview
with (security_invoker = on) as
select
  c.*,
  coalesce(v.count, 0) as vehicles_count,
  coalesce(r.count, 0) as orders_count,
  r.last_visit,
  coalesce(i.revenue_ht, 0) as revenue_ht,
  coalesce(i.balance_due, 0) as balance_due,
  coalesce(i.overdue_count, 0) as overdue_invoices_count
from public.clients c
left join lateral (
  select count(*) as count from public.vehicles where client_id = c.id
) v on true
left join lateral (
  select count(*) as count, max(created_at) as last_visit from public.repair_orders where client_id = c.id
) r on true
left join lateral (
  select sum(t.total_ht) as revenue_ht,
         sum(greatest(b.balance_due, 0)) as balance_due,
         count(*) filter (where b.payment_status = 'overdue') as overdue_count
  from public.invoices inv
  join public.v_invoice_totals t on t.invoice_id = inv.id
  left join public.v_invoice_balances b on b.invoice_id = inv.id
  where inv.client_id = c.id and inv.status = 'issued'
) i on true;

revoke all on public.v_clients_overview from public, anon;
grant select on public.v_clients_overview to authenticated;

-- Liste des véhicules : client, nombre de passages, dernière visite et dernier kilométrage relevé.
create view public.v_vehicles_overview
with (security_invoker = on) as
select
  v.*,
  c.name as client_name,
  coalesce(r.count, 0) as orders_count,
  r.last_visit,
  m.mileage as last_mileage
from public.vehicles v
left join public.clients c on c.id = v.client_id
left join lateral (
  select count(*) as count, max(created_at) as last_visit from public.repair_orders where vehicle_id = v.id
) r on true
left join lateral (
  select mileage from public.repair_orders
  where vehicle_id = v.id and mileage is not null
  order by created_at desc limit 1
) m on true;

revoke all on public.v_vehicles_overview from public, anon;
grant select on public.v_vehicles_overview to authenticated;
