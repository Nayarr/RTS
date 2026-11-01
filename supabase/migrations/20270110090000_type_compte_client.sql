-- Type de compte du client : comptant, prélèvement le 5 ou le 15, règlement à quinzaine (le 15 et le
-- 1er du mois). L'échéance de la facture en découle à son émission.

alter table public.clients drop constraint clients_account_type_check;
alter table public.clients
  add constraint clients_account_type_check
    check (account_type in ('comptant', 'prelevement', 'quinzaine')),
  add column direct_debit_day smallint
    constraint clients_direct_debit_day_check check (direct_debit_day in (5, 15)),
  -- Jour de prélèvement réservé aux clients en prélèvement (absent : jour à préciser)
  add constraint clients_direct_debit_day_account_check
    check (direct_debit_day is null or account_type = 'prelevement');

comment on column public.clients.account_type is
  'Type de compte : comptant (échéance le jour de la facture), prelevement (le 5 ou le 15, '
  'voir direct_debit_day), quinzaine (règlement le 15 et le 1er du mois).';
comment on column public.clients.direct_debit_day is
  'Jour du prélèvement (5 ou 15) d''un client en prélèvement ; absent : délai de paiement des réglages.';

-- Échéance d'une facture émise le p_issued selon le type de compte du client : comptant le jour même ;
-- prélèvement au prochain 5 (ou 15) ; quinzaine le 15 pour une facture du 1er au 15, le 1er du mois
-- suivant après ; sinon le délai de paiement des réglages.
create function public.invoice_due_date(p_account_type text, p_debit_day smallint, p_issued date, p_terms integer)
returns date
language sql
immutable
set search_path to ''
as $$
  select case
    when p_account_type = 'comptant' then p_issued
    when p_account_type = 'prelevement' and p_debit_day is not null then
      case when extract(day from p_issued) <= p_debit_day
           then date_trunc('month', p_issued)::date + (p_debit_day - 1)
           else (date_trunc('month', p_issued) + interval '1 month')::date + (p_debit_day - 1) end
    when p_account_type = 'quinzaine' then
      case when extract(day from p_issued) <= 15
           then date_trunc('month', p_issued)::date + 14
           else (date_trunc('month', p_issued) + interval '1 month')::date end
    else p_issued + p_terms
  end;
$$;
revoke execute on function public.invoice_due_date(text, smallint, date, integer) from public, anon;

create or replace view public.v_clients_overview with (security_invoker = on) as
SELECT c.id,
    c.name,
    c.name_key,
    c.email,
    c.phone,
    c.billing_address,
    c.siret,
    c.discount_percent,
    c.hourly_rate,
    c.portal_token,
    c.notes,
    c.legacy_key,
    c.created_at,
    c.updated_at,
    c.contact_name,
    c.other_phones,
    c.kind,
    c.civility,
    c.first_name,
    c.last_name,
    c.birth_date,
    c.birth_place,
    c.account_type,
    COALESCE(v.count, (0)::bigint) AS vehicles_count,
    COALESCE(r.count, (0)::bigint) AS orders_count,
    r.last_visit,
    COALESCE(i.revenue_ht, (0)::numeric) AS revenue_ht,
    COALESCE(i.balance_due, (0)::numeric) AS balance_due,
    COALESCE(i.overdue_count, (0)::bigint) AS overdue_invoices_count,
    c.archived_at,
    c.direct_debit_day
   FROM (((clients c
     LEFT JOIN LATERAL ( SELECT count(*) AS count
           FROM vehicles
          WHERE (vehicles.client_id = c.id)) v ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS count,
            max(repair_orders.created_at) AS last_visit
           FROM repair_orders
          WHERE (repair_orders.client_id = c.id)) r ON (true))
     LEFT JOIN LATERAL ( SELECT sum(t.total_ht) AS revenue_ht,
            sum(GREATEST(b.balance_due, (0)::numeric)) AS balance_due,
            count(*) FILTER (WHERE (b.payment_status = 'overdue'::text)) AS overdue_count
           FROM ((invoices inv
             JOIN v_invoice_totals t ON ((t.invoice_id = inv.id)))
             LEFT JOIN v_invoice_balances b ON ((b.invoice_id = inv.id)))
          WHERE ((inv.client_id = c.id) AND (inv.status = 'issued'::invoice_status))) i ON (true));

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invoice public.invoices;
  v_client public.clients;
  v_terms integer;
  v_today date := public.paris_date(now());
  v_ht numeric;
  v_vat numeric;
  v_number text;
begin
  perform public.assert_office();

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Cette facture est déjà émise (%)', v_invoice.number using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id and line_type <> 'text') then
    raise exception 'La facture est vide' using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = v_invoice.client_id;
  select payment_terms_days into v_terms from public.company_settings;

  select coalesce(sum(net_ht), 0) into v_ht from public.invoice_lines where invoice_id = p_invoice_id;
  select coalesce(sum(round(g.base * g.vat_rate / 100, 2)), 0) into v_vat
  from (
    select vat_rate, sum(net_ht) as base
    from public.invoice_lines
    where invoice_id = p_invoice_id and line_type <> 'text'
    group by vat_rate
  ) g;

  perform set_config('rts.issuing', 'on', true);
  v_number := public.next_document_number('invoice');

  update public.invoices set
    status = 'issued',
    number = v_number,
    issued_at = now(),
    service_date = coalesce(service_date, current_date),
    due_date = public.invoice_due_date(v_client.account_type, v_client.direct_debit_day, v_today, v_terms),
    client_name = v_client.name,
    client_address = v_client.billing_address,
    client_siret = v_client.siret,
    client_email = v_client.email,
    total_ht = v_ht,
    total_vat = v_vat,
    total_ttc = v_ht + v_vat,
    issued_by = auth.uid()
  where id = p_invoice_id;

  update public.repair_orders r set status = 'invoiced'
  from public.invoice_repair_orders iro
  where iro.invoice_id = p_invoice_id and iro.repair_order_id = r.id;

  insert into public.ro_events (repair_order_id, label, actor_id)
  select iro.repair_order_id, 'Facture ' || v_number || ' émise', auth.uid()
  from public.invoice_repair_orders iro where iro.invoice_id = p_invoice_id;

  perform set_config('rts.issuing', '', true);
  return v_number;
end;
$function$;
