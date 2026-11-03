-- =============================================================================
-- Vente d'un véhicule de la flotte : facture, TVA normale ou TVA sur la marge, comptabilité
--
-- - TVA normale : prix de vente HT, TVA au taux de l'atelier, comme toute facture.
-- - TVA sur la marge (articles 297 A et 297 E du CGI) : la facture ne porte que le prix TTC et la mention
--   du régime ; la TVA due = marge TTC (prix de vente - prix d'achat) × taux / (100 + taux), jamais
--   négative. Elle reste en base dans total_ht / total_vat : export comptable et statistiques justes,
--   documents de l'acheteur sans TVA ni marge.
-- - Le véhicule sort de la flotte dès la vente ; la facture brouillon supprimée (ou l'annulation après
--   un avoir total) le remet en flotte.
-- =============================================================================

alter table public.invoices
  add column vat_scheme text not null default 'normal' check (vat_scheme in ('normal', 'margin')),
  add column margin_purchase_price numeric(12,2) check (margin_purchase_price >= 0),
  add column margin_vat_rate numeric(5,2) check (margin_vat_rate >= 0),
  add constraint invoices_margin_fields check (
    vat_scheme = 'normal' or (margin_purchase_price is not null and margin_vat_rate is not null));
comment on column public.invoices.vat_scheme is
  'normal, ou margin : TVA sur la marge (biens d''occasion), jamais détaillée sur les documents de l''acheteur.';
comment on column public.invoices.margin_purchase_price is 'TVA sur la marge : prix d''achat du bien.';

alter table public.fleet_vehicles add column sold_on date;
comment on column public.fleet_vehicles.sold_on is 'Date de vente : véhicule sorti de la flotte (is_active faux).';

-- TVA comprise dans la marge
create function public.invoice_margin_vat(p_ttc numeric, p_purchase numeric, p_rate numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(greatest(coalesce(p_ttc, 0) - coalesce(p_purchase, 0), 0) * p_rate / (100 + p_rate), 2);
$$;
revoke execute on function public.invoice_margin_vat(numeric, numeric, numeric) from public, anon;
grant execute on function public.invoice_margin_vat(numeric, numeric, numeric) to authenticated;

-- Totaux du brouillon : même calcul qu'à l'émission
create or replace view public.v_invoice_totals
with (security_invoker = on) as
 select i.id as invoice_id,
    case
      when i.status = 'issued'::public.invoice_status then i.total_ht
      when i.vat_scheme = 'margin' then coalesce(s.total_ht, 0::numeric)
        - public.invoice_margin_vat(s.total_ht, i.margin_purchase_price, i.margin_vat_rate)
      else coalesce(s.total_ht, 0::numeric)
    end as total_ht,
    case
      when i.status = 'issued'::public.invoice_status then i.total_vat
      when i.vat_scheme = 'margin' then public.invoice_margin_vat(s.total_ht, i.margin_purchase_price, i.margin_vat_rate)
      else coalesce(s.total_vat, 0::numeric)
    end as total_vat,
    case
      when i.status = 'issued'::public.invoice_status then i.total_ttc
      else coalesce(s.total_ht, 0::numeric) + coalesce(s.total_vat, 0::numeric)
    end as total_ttc
   from public.invoices i
     left join lateral ( select sum(g.base) as total_ht,
            sum(round(g.base * g.vat_rate / 100::numeric, 2)) as total_vat
           from ( select il.vat_rate,
                    sum(il.net_ht) as base
                   from public.invoice_lines il
                  where il.invoice_id = i.id and il.line_type <> 'text'::public.line_type
                  group by il.vat_rate) g) s on true;

-- Chiffre d'affaires : hors TVA comprise dans la marge
create or replace view public.v_invoice_line_economics
with (security_invoker = on) as
 select il.invoice_id,
    i.number as invoice_number,
    i.issued_at,
    i.client_id,
    il.repair_order_id,
    il.line_type,
    (il.net_ht - case when i.vat_scheme = 'margin' then i.total_vat else 0::numeric end)::numeric(12,2) as net_ht,
    case
      when il.line_type = any (array['labor'::public.line_type, 'package'::public.line_type, 'travel'::public.line_type]) then il.net_ht
      else 0::numeric
    end as labor_ht,
    case
      when il.line_type = any (array['part'::public.line_type, 'consumable'::public.line_type, 'subcontract'::public.line_type]) then il.net_ht
      else 0::numeric
    end as parts_ht,
    case
      when il.line_type = any (array['part'::public.line_type, 'consumable'::public.line_type, 'subcontract'::public.line_type])
        then il.net_ht - coalesce(il.purchase_price, 0::numeric) *
        case
          when il.line_type = 'subcontract'::public.line_type then 1::numeric
          else il.quantity
        end - coalesce(il.shipping_cost, 0::numeric)
      else 0::numeric
    end as parts_margin_ht,
    coalesce(il.billed_hours, il.standard_hours, 0::numeric) as billed_hours
   from public.invoice_lines il
     join public.invoices i on i.id = il.invoice_id
  where i.status = 'issued'::public.invoice_status and il.line_type <> 'text'::public.line_type;

-- TVA sur la marge : pas d'exonération (la vente reste taxée en France), lignes à 0 %, le véhicule seul
create or replace function public.invoices_default_vat_exemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mention text := public.client_vat_exemption(new.client_id);
begin
  if new.status = 'draft' and not new.vat_exempt and new.vat_scheme = 'normal' and v_mention is not null then
    new.vat_exempt := true;
    new.vat_exempt_mention := v_mention;
    new.client_vat_number := (select vat_number from public.clients where id = new.client_id);
  end if;
  return new;
end;
$$;

create function public.invoices_margin_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vat_scheme = 'margin' and new.vat_exempt then
    raise exception 'Une vente en TVA sur la marge ne peut pas être sans TVA' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.invoices_margin_guard() from public, anon;
create trigger invoices_margin_guard
  before update on public.invoices
  for each row execute function public.invoices_margin_guard();

create function public.invoice_lines_margin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.invoices where id = new.invoice_id and vat_scheme = 'margin') then
    if exists (select 1 from public.invoice_lines where invoice_id = new.invoice_id) then
      raise exception 'Une vente en TVA sur la marge ne porte que le véhicule' using errcode = 'P0001';
    end if;
    new.vat_rate := 0;
  end if;
  return new;
end;
$$;
revoke execute on function public.invoice_lines_margin() from public, anon;
create trigger invoice_lines_margin
  before insert on public.invoice_lines
  for each row execute function public.invoice_lines_margin();

create table public.fleet_vehicle_sales (
  id                uuid primary key default gen_random_uuid(),
  fleet_vehicle_id  uuid not null unique references public.fleet_vehicles (id) on delete restrict,
  client_id         uuid not null references public.clients (id) on delete restrict,
  invoice_id        uuid not null references public.invoices (id) on delete cascade,
  sold_at           timestamptz not null,
  mileage           integer check (mileage >= 0),
  vat_scheme        text not null check (vat_scheme in ('normal', 'margin')),
  sale_price        numeric(12,2) not null check (sale_price > 0),
  purchase_price    numeric(12,2) check (purchase_price >= 0),
  created_by        uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);
create index fleet_vehicle_sales_invoice_idx on public.fleet_vehicle_sales (invoice_id);
create index fleet_vehicle_sales_client_idx on public.fleet_vehicle_sales (client_id);
comment on table public.fleet_vehicle_sales is
  'Vente d''un véhicule de la flotte. sale_price : HT en TVA normale, TTC en TVA sur la marge.';

-- Lecture par le bureau ; écriture par les fonctions ci-dessous seulement
alter table public.fleet_vehicle_sales enable row level security;
create policy fleet_vehicle_sales_select on public.fleet_vehicle_sales for select to authenticated
  using (public.is_office());

-- Vente annulée (facture brouillon supprimée, annulation) : le véhicule revient dans la flotte
create function public.fleet_vehicle_sales_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.fleet_vehicles set is_active = true, sold_on = null where id = old.fleet_vehicle_id;
  return null;
end;
$$;
revoke execute on function public.fleet_vehicle_sales_after_delete() from public, anon;
create trigger fleet_vehicle_sales_after_delete
  after delete on public.fleet_vehicle_sales
  for each row execute function public.fleet_vehicle_sales_after_delete();

create function public.sell_fleet_vehicle(
  p_vehicle_id uuid,
  p_client_id uuid,
  p_sold_at timestamptz,
  p_mileage integer,
  p_vat_scheme text,
  p_price numeric,
  p_purchase_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.fleet_vehicles;
  v_rate numeric := coalesce((select default_vat_rate from public.company_settings), 20);
  v_margin boolean := p_vat_scheme = 'margin';
  v_title text;
  v_invoice_id uuid;
begin
  perform public.assert_office();
  select * into v_vehicle from public.fleet_vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'Véhicule introuvable' using errcode = 'P0002';
  end if;
  if v_vehicle.sold_on is not null then
    raise exception 'Ce véhicule est déjà vendu' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.rentals
             where fleet_vehicle_id = p_vehicle_id and status in ('reserved', 'active', 'returned')) then
    raise exception 'Ce véhicule a une location en cours ou réservée : clôture-la ou annule-la d''abord'
      using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id and archived_at is null) then
    raise exception 'Client introuvable ou archivé' using errcode = 'P0002';
  end if;
  if p_vat_scheme is null or p_vat_scheme not in ('normal', 'margin') then
    raise exception 'Régime de TVA invalide' using errcode = '22023';
  end if;
  if coalesce(p_price, 0) <= 0 then
    raise exception 'Indique le prix de vente' using errcode = '22023';
  end if;
  if v_margin and coalesce(p_purchase_price, -1) < 0 then
    raise exception 'Indique le prix d''achat : la TVA sur la marge en dépend' using errcode = '22023';
  end if;

  v_title := v_vehicle.brand || ' ' || v_vehicle.model;
  insert into public.invoices (client_id, vehicle_label, service_date, mileage, created_by,
                               vat_scheme, margin_purchase_price, margin_vat_rate, vat_exempt_mention)
  values (p_client_id, v_vehicle.plate || ' · ' || v_title, public.paris_date(p_sold_at), p_mileage, auth.uid(),
          p_vat_scheme,
          case when v_margin then p_purchase_price end,
          case when v_margin then v_rate end,
          case when v_margin then 'TVA sur la marge : régime particulier - biens d''occasion (articles 297 A et 297 E du CGI). TVA non récupérable par l''acquéreur.' end)
  returning id into v_invoice_id;
  -- Pas de « Fournitures et recyclage » sur la vente d'un véhicule
  delete from public.invoice_lines where invoice_id = v_invoice_id;
  insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
  values (v_invoice_id, 0, 'vehicle',
          'Vente véhicule d''occasion ' || v_title || ' · ' || v_vehicle.plate || coalesce(
            E'\n' || nullif(concat_ws(' · ',
              case when v_vehicle.vin is not null then 'N° de série ' || v_vehicle.vin end,
              case when v_vehicle.first_registration is not null
                   then 'Mise en circulation le ' || to_char(v_vehicle.first_registration, 'DD/MM/YYYY') end,
              case when p_mileage is not null then p_mileage || ' km' end), ''), ''),
          round(p_price, 2), 1, case when v_margin then 0 else v_rate end);

  insert into public.fleet_vehicle_sales (fleet_vehicle_id, client_id, invoice_id, sold_at, mileage, vat_scheme,
                                          sale_price, purchase_price)
  values (p_vehicle_id, p_client_id, v_invoice_id, p_sold_at, p_mileage, p_vat_scheme,
          round(p_price, 2), case when v_margin then p_purchase_price end);
  update public.fleet_vehicles
     set is_active = false, sold_on = public.paris_date(p_sold_at), mileage = coalesce(p_mileage, mileage)
   where id = p_vehicle_id;
  return v_invoice_id;
end;
$$;
revoke execute on function public.sell_fleet_vehicle(uuid, uuid, timestamptz, integer, text, numeric, numeric) from public, anon;
grant execute on function public.sell_fleet_vehicle(uuid, uuid, timestamptz, integer, text, numeric, numeric) to authenticated;

-- Annulation : facture brouillon supprimée ; facture émise : après un avoir de la totalité
create function public.cancel_fleet_vehicle_sale(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.fleet_vehicle_sales;
  v_invoice public.invoices;
  v_credited numeric;
begin
  perform public.assert_office();
  select * into v_sale from public.fleet_vehicle_sales where fleet_vehicle_id = p_vehicle_id for update;
  if not found then
    raise exception 'Ce véhicule n''est pas vendu' using errcode = 'P0002';
  end if;
  select * into v_invoice from public.invoices where id = v_sale.invoice_id;
  if v_invoice.status = 'draft' then
    delete from public.invoices where id = v_invoice.id;
    return;
  end if;
  select coalesce(credited_ttc, 0) into v_credited from public.v_invoice_balances where invoice_id = v_invoice.id;
  if coalesce(v_credited, 0) < v_invoice.total_ttc then
    raise exception 'Facture % émise : fais d''abord un avoir de la totalité pour annuler la vente', v_invoice.number
      using errcode = 'P0001';
  end if;
  delete from public.fleet_vehicle_sales where id = v_sale.id;
end;
$$;
revoke execute on function public.cancel_fleet_vehicle_sale(uuid) from public, anon;
grant execute on function public.cancel_fleet_vehicle_sale(uuid) to authenticated;

-- Liste et détail des factures : régime de TVA
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
    i.vat_exempt_mention,
    i.sent_at,
    i.vat_scheme,
    i.margin_purchase_price
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

-- Facture en ligne : régime de TVA, totaux sans la marge
CREATE OR REPLACE FUNCTION public.public_find_document(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- TVA sur la marge : ni la TVA ni la marge ne sont communiquées à l'acheteur (article 297 E du CGI)
      'vat_scheme', v_invoice.vat_scheme,
      'totals', case when v_invoice.vat_scheme = 'margin'
                  then jsonb_build_object('total_ht', v_invoice.total_ttc, 'total_vat', 0, 'total_ttc', v_invoice.total_ttc)
                  else jsonb_build_object('total_ht', v_invoice.total_ht, 'total_vat', v_invoice.total_vat, 'total_ttc', v_invoice.total_ttc)
                end,
      'balance_due', (select balance_due from public.v_invoice_balances where invoice_id = v_invoice.id),
      'legal_mentions', (select to_jsonb(invoice_legal_mentions) from public.company_settings),
      'terms', (select invoice_terms from public.company_settings),
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
          where r.vehicle_id = v.id and r.client_id = v_client.id and r.status not in ('invoiced')
          order by r.created_at desc limit 1) cur on true
        where v.client_id = v_client.id
           or exists (select 1 from public.repair_orders r where r.vehicle_id = v.id and r.client_id = v_client.id
                        and r.status not in ('invoiced'))), '[]'::jsonb),
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
$function$;

-- Émission : TVA sur la marge
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

  -- TVA sur la marge : prix de vente TTC sur la ligne ; TVA calculée sur la marge, gardée pour la comptabilité
  if v_invoice.vat_scheme = 'margin' then
    v_vat := public.invoice_margin_vat(v_ht, v_invoice.margin_purchase_price, v_invoice.margin_vat_rate);
    v_ht := v_ht - v_vat;
  end if;

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
