-- Fiche client : plusieurs numéros de téléphone.
--   * contact de référence : son nom (contact_name) et le numéro principal (phone, utilisé pour les SMS) ;
--   * autres numéros (other_phones) : chacun avec un libellé (« Comptabilité », « Chef d'atelier »…).

alter table public.clients
  add column contact_name text check (contact_name is null or length(contact_name) <= 120),
  add column other_phones jsonb not null default '[]'::jsonb;

-- Liste [{ "label": "Comptabilité", "phone": "01 23 45 67 89" }, …] : 10 numéros au plus,
-- libellé et numéro renseignés, rien d'autre dans chaque entrée.
create or replace function public.valid_client_phones(p_phones jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p_phones) = 'array'
     and jsonb_array_length(p_phones) <= 10
     and not exists (
       select 1
       from jsonb_array_elements(p_phones) e
       where jsonb_typeof(e) <> 'object'
          or (select count(*) from jsonb_object_keys(e)) <> 2
          or jsonb_typeof(e -> 'label') is distinct from 'string'
          or jsonb_typeof(e -> 'phone') is distinct from 'string'
          or btrim(e ->> 'label') = '' or length(e ->> 'label') > 60
          or btrim(e ->> 'phone') = '' or length(e ->> 'phone') > 30
     );
$$;
-- Contrôle utilisé par la contrainte : comptes connectés seulement (jamais les visiteurs anonymes).
revoke execute on function public.valid_client_phones(jsonb) from public, anon;
grant execute on function public.valid_client_phones(jsonb) to authenticated;

alter table public.clients
  add constraint clients_other_phones_check check (public.valid_client_phones(other_phones));

comment on column public.clients.contact_name is 'Contact de référence chez le client (son numéro : phone).';
comment on column public.clients.other_phones is
  'Autres numéros, après le contact de référence : [{label, phone}] (ex. « Comptabilité »).';

-- La liste des clients reprend les nouvelles colonnes (c.* est figé à la création de la vue).
drop view public.v_clients_overview;
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
