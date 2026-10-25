-- =============================================================================
-- Facture sans TVA : exonération (clients étrangers au numéro de TVA vérifié) ou au choix
--
-- Demande du client : un bouton pour ne pas facturer la TVA ; exonération pour les clients
-- étrangers dont le numéro de TVA est valide (Union européenne : vérifié auprès de VIES ; hors
-- Union européenne : format contrôlé, aucun service public commun).
-- - Fiche client : numéro de TVA, état de la vérification (Edge Function « vat-check »).
-- - Brouillon : « Sans TVA » met toutes les lignes à 0 % et pose la mention (modifiable) et le
--   numéro de TVA du client ; un brouillon d'un client étranger vérifié part directement sans TVA.
-- - Réglages : les deux mentions (autoliquidation dans l'Union européenne, exonération hors Union).
-- =============================================================================

alter table public.clients
  add column vat_number text check (vat_number ~ '^[A-Z]{2}[0-9A-Z]{2,15}$'),
  add column vat_status text not null default 'unchecked'
    check (vat_status in ('unchecked', 'valid', 'format', 'invalid', 'unavailable')),
  add column vat_checked_at timestamptz,
  add column vat_registered_name text;
comment on column public.clients.vat_number is 'N° de TVA du client (intracommunautaire ou étranger), sans espaces.';
comment on column public.clients.vat_status is
  'Vérification du n° de TVA : valid (VIES), format (hors Union européenne : format contrôlé), invalid, unavailable (VIES injoignable), unchecked.';

alter table public.company_settings
  add column vat_exempt_mention_eu text not null
    default 'Autoliquidation : TVA due par le preneur (article 283-2 du CGI, article 196 de la directive 2006/112/CE).',
  add column vat_exempt_mention_other text not null
    default 'Exonération de TVA : prestation hors du champ de la TVA française (article 259-1 du CGI).';

alter table public.invoices
  add column vat_exempt boolean not null default false,
  add column client_vat_number text,
  add column vat_exempt_mention text;
comment on column public.invoices.vat_exempt is 'Facture sans TVA (lignes à 0 %), avec sa mention.';

-- Pays de l'Union européenne (préfixes de TVA, Grèce « EL », Irlande du Nord « XI »)
create function public.is_eu_vat_prefix(p_prefix text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_prefix = any (array['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU',
                               'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI']);
$$;
revoke execute on function public.is_eu_vat_prefix(text) from public, anon;
grant execute on function public.is_eu_vat_prefix(text) to authenticated;

-- Client étranger au numéro vérifié : exonéré d'office
create function public.client_vat_exemption(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when c.vat_number is null or left(c.vat_number, 2) = 'FR' then null
           when c.vat_status = 'valid' and public.is_eu_vat_prefix(left(c.vat_number, 2)) then s.vat_exempt_mention_eu
           when c.vat_status in ('valid', 'format') and not public.is_eu_vat_prefix(left(c.vat_number, 2))
             then s.vat_exempt_mention_other
         end
  from public.clients c cross join public.company_settings s
  where c.id = p_client_id;
$$;
revoke execute on function public.client_vat_exemption(uuid) from public, anon;
grant execute on function public.client_vat_exemption(uuid) to authenticated;

-- Nouveau brouillon : sans TVA d'office pour un client étranger vérifié
create function public.invoices_default_vat_exemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mention text := public.client_vat_exemption(new.client_id);
begin
  if new.status = 'draft' and not new.vat_exempt and v_mention is not null then
    new.vat_exempt := true;
    new.vat_exempt_mention := v_mention;
    new.client_vat_number := (select vat_number from public.clients where id = new.client_id);
  end if;
  return new;
end;
$$;
revoke execute on function public.invoices_default_vat_exemption() from public, anon;
create trigger invoices_default_vat_exemption
  before insert on public.invoices
  for each row execute function public.invoices_default_vat_exemption();

-- Ligne ajoutée à une facture sans TVA : 0 %
create function public.invoice_lines_vat_exempt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.invoices where id = new.invoice_id and vat_exempt and status = 'draft') then
    new.vat_rate := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoice_lines_vat_exempt() from public, anon;
create trigger invoice_lines_vat_exempt
  before insert on public.invoice_lines
  for each row execute function public.invoice_lines_vat_exempt();

-- « Sans TVA » sur un brouillon (bureau) : lignes à 0 % et mention, ou retour au taux de l'atelier
create function public.set_invoice_vat_exempt(p_invoice_id uuid, p_exempt boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_client public.clients;
  v_settings public.company_settings;
begin
  perform public.assert_office();
  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Une facture émise ne change plus de TVA (faire un avoir)' using errcode = 'P0001';
  end if;
  select * into v_client from public.clients where id = v_invoice.client_id;
  select * into v_settings from public.company_settings;

  update public.invoices
     set vat_exempt = p_exempt,
         client_vat_number = case when p_exempt then v_client.vat_number end,
         vat_exempt_mention = case
           when not p_exempt then null
           else coalesce(public.client_vat_exemption(v_client.id),
                         case when v_client.vat_number is not null
                                   and public.is_eu_vat_prefix(left(v_client.vat_number, 2))
                                   and left(v_client.vat_number, 2) <> 'FR'
                              then v_settings.vat_exempt_mention_eu
                              else v_settings.vat_exempt_mention_other end)
         end
   where id = p_invoice_id;
  update public.invoice_lines
     set vat_rate = case when p_exempt then 0 else v_settings.default_vat_rate end
   where invoice_id = p_invoice_id;
end;
$$;
revoke execute on function public.set_invoice_vat_exempt(uuid, boolean) from public, anon;
grant execute on function public.set_invoice_vat_exempt(uuid, boolean) to authenticated;

-- État de la vérification : posé par la fonction « vat-check » seule ; un numéro changé repart à vérifier
create function public.clients_vat_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_service boolean := coalesce((select auth.role()), '') = 'service_role'
                       or public.is_system_context();
begin
  if tg_op = 'INSERT' then
    if not v_service then
      new.vat_status := 'unchecked';
      new.vat_checked_at := null;
      new.vat_registered_name := null;
    end if;
    return new;
  end if;
  if new.vat_number is distinct from old.vat_number and not v_service then
    new.vat_status := 'unchecked';
    new.vat_checked_at := null;
    new.vat_registered_name := null;
  elsif not v_service and (new.vat_status is distinct from old.vat_status
                           or new.vat_checked_at is distinct from old.vat_checked_at
                           or new.vat_registered_name is distinct from old.vat_registered_name) then
    raise exception 'La vérification du n° de TVA passe par « Vérifier »' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.clients_vat_guard() from public, anon;
create trigger clients_vat_guard
  before insert or update on public.clients
  for each row execute function public.clients_vat_guard();

-- Liste et détail des factures : TVA exonérée
create or replace view public.v_invoices_overview
with (security_invoker = on) as
 SELECT i.id,
    i.number,
    i.status,
    i.client_id,
    COALESCE(i.client_name, c.name) AS client_name,
    i.client_address,
    i.client_siret,
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
    COALESCE(ro.ids, '{}'::uuid[]) AS repair_order_ids,
    COALESCE(ro.numbers, '{}'::text[]) AS repair_order_numbers,
    COALESCE(rm.count, 0::bigint) AS reminders_count,
    rm.last_sent_at AS last_reminder_at,
    i.vat_exempt,
    i.client_vat_number,
    i.vat_exempt_mention
   FROM invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     JOIN v_invoice_totals t ON t.invoice_id = i.id
     LEFT JOIN v_invoice_balances b ON b.invoice_id = i.id
     LEFT JOIN LATERAL ( SELECT array_agg(r.id ORDER BY r.number) AS ids,
            array_agg(r.number ORDER BY r.number) AS numbers
           FROM invoice_repair_orders iro
             JOIN repair_orders r ON r.id = iro.repair_order_id
          WHERE iro.invoice_id = i.id) ro ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS count,
            max(invoice_reminders.sent_at) AS last_sent_at
           FROM invoice_reminders
          WHERE invoice_reminders.invoice_id = i.id) rm ON true;

-- Facture en ligne : n° de TVA du client et mention d'exonération
CREATE OR REPLACE FUNCTION public.public_find_document(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_company jsonb;
  v_quote public.quotes;
  v_invoice public.invoices;
  v_client public.clients;
  v_request public.signature_requests;
  v_ro public.repair_orders;
  v_rental public.rentals;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select jsonb_build_object(
           'legal_name', legal_name, 'address_line', address_line, 'postal_code', postal_code, 'city', city,
           'email', email, 'phone', phone, 'siret', siret, 'vat_number', vat_number)
    into v_company
  from public.company_settings;

  -- Devis
  select * into v_quote from public.quotes where public_token = p_token;
  if found then
    return jsonb_build_object(
      'type', 'quote',
      'company', v_company,
      'number', v_quote.number,
      'issued_at', v_quote.issued_at,
      'valid_until', v_quote.valid_until,
      'status', v_quote.status,
      'accepted_by_name', v_quote.accepted_by_name,
      'accepted_at', v_quote.accepted_at,
      'client_name', (select name from public.clients where id = v_quote.client_id),
      'vehicle_plate', (select plate from public.vehicles where id = v_quote.vehicle_id),
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'section', section, 'line_type', line_type, 'description', description,
                 'unit_price', unit_price, 'quantity', quantity, 'discount_percent', discount_percent,
                 'vat_rate', vat_rate, 'net_ht', net_ht) order by section, position)
        from public.quote_lines
        where quote_id = v_quote.id and (line_type = 'text' or net_ht > 0)), '[]'::jsonb),
      'totals', (select jsonb_build_object('total_ht', total_ht, 'total_vat', total_vat, 'total_ttc', total_ttc)
                 from public.v_quote_totals where quote_id = v_quote.id)
    );
  end if;

  -- Facture
  select * into v_invoice from public.invoices where public_token = p_token and status = 'issued';
  if found then
    return jsonb_build_object(
      'type', 'invoice',
      'company', v_company,
      'number', v_invoice.number,
      'issued_at', v_invoice.issued_at,
      'service_date', v_invoice.service_date,
      'due_date', v_invoice.due_date,
      'client_name', v_invoice.client_name,
      'client_address', v_invoice.client_address,
      'client_vat_number', v_invoice.client_vat_number,
      'vat_exempt_mention', v_invoice.vat_exempt_mention,
      'vehicle_label', v_invoice.vehicle_label,
      'mileage', v_invoice.mileage,
      'lines', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'line_type', line_type, 'description', description, 'unit_price', unit_price,
                 'quantity', quantity, 'discount_percent', discount_percent, 'vat_rate', vat_rate,
                 'net_ht', net_ht) order by position)
        from public.invoice_lines where invoice_id = v_invoice.id), '[]'::jsonb),
      'totals', jsonb_build_object('total_ht', v_invoice.total_ht, 'total_vat', v_invoice.total_vat, 'total_ttc', v_invoice.total_ttc),
      'balance_due', (select balance_due from public.v_invoice_balances where invoice_id = v_invoice.id),
      'legal_mentions', (select to_jsonb(invoice_legal_mentions) from public.company_settings),
      -- RIB de l'atelier : règlement par virement
      'iban', (select iban from public.company_settings),
      'bic', (select bic from public.company_settings)
    );
  end if;

  -- Espace client (données calculées en direct)
  select * into v_client from public.clients where portal_token = p_token;
  if found then
    -- Chaque facture affichée dans l'espace client reçoit son lien de consultation.
    update public.invoices
       set public_token = public.generate_public_token()
     where client_id = v_client.id and status = 'issued' and public_token is null;

    return jsonb_build_object(
      'type', 'portal',
      'company', v_company,
      'client_name', v_client.name,
      'generated_at', now(),
      'vehicles', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'plate', v.plate,
                 'in_workshop', cur.status is not null,
                 'status_label', coalesce(public.repair_order_status_label(cur.status), 'Pas à l''atelier'),
                 'since', cur.created_at,
                 'ct_due_date', v.ct_due_date,
                 'tailgate_due_date', v.tailgate_due_date) order by v.plate)
        from public.vehicles v
        left join lateral (
          select r.status, r.created_at from public.repair_orders r
          where r.vehicle_id = v.id and r.status not in ('invoiced')
          order by r.created_at desc limit 1) cur on true
        where v.client_id = v_client.id
           or exists (select 1 from public.repair_orders r where r.vehicle_id = v.id and r.client_id = v_client.id)), '[]'::jsonb),
      'quotes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'number', q.number, 'vehicle_plate', v.plate, 'token', q.public_token) order by q.sent_at desc)
        from public.quotes q left join public.vehicles v on v.id = q.vehicle_id
        where q.client_id = v_client.id and q.status = 'sent' and q.public_token is not null), '[]'::jsonb),
      'invoices', coalesce((
        select jsonb_agg(x.doc order by x.issued_at desc)
        from (
          select i.issued_at,
                 jsonb_build_object(
                   'number', i.number, 'issued_at', i.issued_at, 'vehicle_label', i.vehicle_label,
                   'total_ttc', i.total_ttc, 'balance_due', b.balance_due, 'payment_status', b.payment_status,
                   'token', i.public_token) as doc
          from public.invoices i
          join public.v_invoice_balances b on b.invoice_id = i.id
          where i.client_id = v_client.id and i.status = 'issued'
          order by i.issued_at desc
          limit 40) x), '[]'::jsonb)
    );
  end if;

  -- Demande de signature d'un OR (lien envoyé au client absent)
  select * into v_request from public.signature_requests where public_token = p_token and channel = 'email';
  if found and v_request.rental_id is not null then
    select * into v_rental from public.rentals where id = v_request.rental_id;
    return jsonb_build_object(
      'type', 'rental_signature',
      'company', v_company,
      'status', case when v_request.status = 'pending' and v_request.expires_at <= now() then 'expired'
                     else v_request.status::text end,
      'expires_at', v_request.expires_at
    ) || public.rental_public_json(v_rental);
  end if;
  if found then
    select * into v_ro from public.repair_orders where id = v_request.repair_order_id;
    return jsonb_build_object(
      'type', 'signature',
      'company', v_company,
      'number', v_ro.number,
      'status', case when v_request.status = 'pending' and v_request.expires_at <= now() then 'expired'
                     else v_request.status::text end,
      'expires_at', v_request.expires_at,
      'signed_at', v_request.signed_at,
      'signer_name', v_request.signer_name,
      'client_name', (select name from public.clients where id = v_ro.client_id),
      'vehicle_plate', (select plate from public.vehicles where id = v_ro.vehicle_id),
      'requested_work', v_ro.requested_work,
      'planned_date', v_ro.planned_date,
      'mileage', v_ro.mileage
    );
  end if;

  -- Contrat de location envoyé au client (consultation, impression)
  select * into v_rental from public.rentals where public_token = p_token and status <> 'cancelled';
  if found then
    return jsonb_build_object('type', 'rental', 'company', v_company) || public.rental_public_json(v_rental);
  end if;

  return null;
end;
$$;
