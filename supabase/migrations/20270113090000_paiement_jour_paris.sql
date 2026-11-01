-- Dates du jour de Paris, comme l'échéance de la facture : sinon, entre minuit et 1 h (2 h l'été), la
-- base est encore la veille en UTC et un client comptant paraît payé 1 jour avant son échéance.

-- Paiement saisi sans date (API, agent) : jour de Paris
alter table public.payments alter column paid_on set default public.paris_date(now());

-- Date de prestation absente à l'émission : jour de Paris
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
    service_date = coalesce(service_date, v_today),
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
