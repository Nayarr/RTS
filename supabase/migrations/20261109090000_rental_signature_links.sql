-- =============================================================================
-- Location — signature du contrat à distance et envoi du contrat au client
--
--   * Signature par lien e-mail : comme pour l'OR, le bureau prépare un lien (valable 7 jours)
--     que le client ouvre sans compte ; il relit le contrat (véhicule, période, conditions)
--     et le signe en ligne. L'Edge Function « ro-signature » range l'image puis appelle
--     public_sign_link(), qui reconnaît un OR ou un contrat de location.
--   * Contrat signé puis conditions modifiées avant le départ : la signature est retirée,
--     le contrat est à signer de nouveau.
--   * Envoi du contrat : lien de consultation permanent (rentals.public_token), le client
--     relit son contrat et l'imprime ou l'enregistre en PDF depuis son navigateur.
-- =============================================================================

-- ---------------------------------------------------------------- Demandes de signature d'un contrat

alter table public.signature_requests
  alter column repair_order_id drop not null,
  add column rental_id uuid references public.rentals (id) on delete cascade,
  add constraint signature_requests_target_check check (num_nonnulls(repair_order_id, rental_id) = 1),
  -- Contrat de location : uniquement par lien e-mail (la signature sur place se fait au comptoir)
  add constraint signature_requests_rental_channel_check check (rental_id is null or channel = 'email');
create index signature_requests_rental_idx on public.signature_requests (rental_id, created_at desc)
  where rental_id is not null;
comment on table public.signature_requests is
  'Demandes de signature par le client : OR (borne 1 minute ou lien e-mail 7 jours) ou contrat de location (lien e-mail 7 jours).';

-- Lien de consultation du contrat envoyé au client
alter table public.rentals add column public_token text unique;

-- ---------------------------------------------------------------- Garde-fous du contrat

create or replace function public.rental_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_last integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'reserved' then
      raise exception 'Un contrat commence toujours réservé' using errcode = '22023';
    end if;
    v_year := extract(year from public.paris_date(new.departure_at))::integer;
    insert into public.rental_sequences as s (kind, year, last_value) values (new.kind, v_year, 1)
    on conflict (kind, year) do update set last_value = s.last_value + 1
    returning last_value into v_last;
    new.number := case new.kind when 'rental' then 'LC-' else 'PR-' end
                  || v_year || '-' || lpad(v_last::text, 4, '0');
    return new;
  end if;

  if new.number is distinct from old.number or new.kind is distinct from old.kind then
    raise exception 'Le numéro et le type du contrat ne changent pas' using errcode = '22023';
  end if;
  -- Les changements de statut passent par les fonctions (départ, retour, clôture, annulation)
  if new.status is distinct from old.status
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'Statut du contrat modifié seulement par le départ, le retour ou la clôture'
      using errcode = '42501';
  end if;
  -- Après le départ, les conditions et la période de départ sont figées (seuls retour prévu et notes bougent)
  if old.status <> 'reserved' and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' and (
       new.client_id, new.fleet_vehicle_id, new.driving_license_id, new.departure_at, new.rate_period,
       new.unit_price, new.periods, new.discount_percent, new.km_included, new.extra_km_price,
       new.fuel_price_per_liter, new.cleaning_fee, new.late_fee_per_hour, new.deposit, new.franchise,
       new.billable, new.signature_file_id, new.signed_at
     ) is distinct from (
       old.client_id, old.fleet_vehicle_id, old.driving_license_id, old.departure_at, old.rate_period,
       old.unit_price, old.periods, old.discount_percent, old.km_included, old.extra_km_price,
       old.fuel_price_per_liter, old.cleaning_fee, old.late_fee_per_hour, old.deposit, old.franchise,
       old.billable, old.signature_file_id, old.signed_at
     ) then
    raise exception 'Contrat déjà parti : les conditions ne se modifient plus' using errcode = '42501';
  end if;
  if old.status in ('closed', 'cancelled')
     and coalesce(current_setting('rts.rental_transition', true), '') <> 'on' then
    raise exception 'Contrat clôturé ou annulé : plus modifiable' using errcode = '42501';
  end if;

  if old.status = 'reserved' then
    -- Contrat signé dont les conditions changent avant le départ : à signer de nouveau.
    if old.signed_at is not null and new.signed_at is not distinct from old.signed_at and (
         new.client_id, new.fleet_vehicle_id, new.departure_at, new.planned_return_at, new.rate_period,
         new.unit_price, new.periods, new.discount_percent, new.km_included, new.extra_km_price,
         new.fuel_price_per_liter, new.cleaning_fee, new.late_fee_per_hour, new.deposit, new.deposit_mode,
         new.franchise, new.billable
       ) is distinct from (
         old.client_id, old.fleet_vehicle_id, old.departure_at, old.planned_return_at, old.rate_period,
         old.unit_price, old.periods, old.discount_percent, old.km_included, old.extra_km_price,
         old.fuel_price_per_liter, old.cleaning_fee, old.late_fee_per_hour, old.deposit, old.deposit_mode,
         old.franchise, old.billable
       ) then
      new.signature_file_id := null;
      new.signed_at := null;
      new.terms_accepted := false;
    end if;
    -- Signé au comptoir : le lien envoyé par e-mail n'a plus lieu d'être.
    if old.signed_at is null and new.signed_at is not null then
      update public.signature_requests set status = 'cancelled'
       where rental_id = new.id and status = 'pending';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.rental_before_write() from public, anon, authenticated;

-- ---------------------------------------------------------------- Bureau : demander la signature par e-mail

create or replace function public.request_rental_signature(p_rental_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_request public.signature_requests;
begin
  perform public.assert_office();
  select * into v_rental from public.rentals where id = p_rental_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_rental.status <> 'reserved' then
    raise exception 'Clés déjà remises : le contrat ne se signe plus à distance' using errcode = 'P0001';
  end if;
  if v_rental.signed_at is not null then
    raise exception 'Le client a déjà signé ce contrat' using errcode = 'P0001';
  end if;

  -- Lien déjà envoyé et toujours valable : le même lien est repris.
  select * into v_request from public.signature_requests
  where rental_id = p_rental_id and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if found then
    return public.signature_request_json(v_request);
  end if;

  insert into public.signature_requests (rental_id, channel, public_token, expires_at, created_by)
  values (p_rental_id, 'email', public.generate_public_token(), now() + interval '7 days', auth.uid())
  returning * into v_request;
  return public.signature_request_json(v_request);
end;
$$;

-- Bureau : dernière demande de signature du contrat, ou null.
create or replace function public.rental_signature_request(p_rental_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request public.signature_requests;
begin
  perform public.assert_office();
  select * into v_request from public.signature_requests
  where rental_id = p_rental_id
  order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  return public.signature_request_json(v_request);
end;
$$;

-- Bureau : lien de consultation du contrat (créé au premier envoi, ensuite repris).
create or replace function public.share_rental(p_rental_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.assert_office();
  update public.rentals
     set public_token = coalesce(public_token, public.generate_public_token())
   where id = p_rental_id and status <> 'cancelled'
  returning public_token into v_token;
  if v_token is null then
    raise exception 'Contrat introuvable ou annulé' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;

-- ---------------------------------------------------------------- Signature reçue en ligne

create or replace function public.apply_rental_signature(
  p_request public.signature_requests,
  p_signer_name text,
  p_signature_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rental public.rentals;
  v_plate text;
begin
  select * into v_rental from public.rentals where id = p_request.rental_id for update;
  if v_rental.signed_at is not null then
    raise exception 'Ce contrat est déjà signé' using errcode = 'P0001';
  end if;
  if v_rental.status <> 'reserved' then
    raise exception 'Lien de signature expiré : contactez l''atelier' using errcode = 'P0001';
  end if;

  update public.signature_requests
     set status = 'signed', signed_at = now(), signer_name = nullif(btrim(p_signer_name), ''),
         signature_file_id = p_signature_file_id
   where id = p_request.id;
  -- Les autres liens en attente sont annulés par le garde-fou du contrat.
  update public.rentals
     set signature_file_id = p_signature_file_id, signed_at = now(), terms_accepted = true
   where id = v_rental.id;

  select plate into v_plate from public.fleet_vehicles where id = v_rental.fleet_vehicle_id;
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select role, 'signature_received', 'Contrat signé : ' || coalesce(v_plate, v_rental.number),
         v_rental.number || ' — signé en ligne' || coalesce(' par ' || nullif(btrim(p_signer_name), ''), ''),
         '/location/contrats/' || v_rental.id, 'signature-' || p_request.id || '-' || role
  from (values ('direction'::public.app_role), ('reception'::public.app_role)) roles(role)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Lien e-mail : signature d'un OR ou d'un contrat. Appelée uniquement par l'Edge Function (qui range l'image).
create or replace function public.public_sign_link(
  p_token text,
  p_signer_name text,
  p_signature_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.signature_requests;
begin
  select * into v_request from public.signature_requests
  where public_token = p_token and channel = 'email' for update;
  if not found then
    raise exception 'Lien de signature inconnu' using errcode = 'P0002';
  end if;
  if v_request.repair_order_id is not null then
    return public.public_sign_repair_order(p_token, p_signer_name, p_signature_file_id);
  end if;

  if v_request.status = 'signed' then
    raise exception 'Ce contrat est déjà signé' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pending' or v_request.expires_at <= now() then
    raise exception 'Lien de signature expiré : contactez l''atelier' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_signer_name), '') = '' then
    raise exception 'Indiquez votre nom' using errcode = '22023';
  end if;
  if p_signature_file_id is null then
    raise exception 'Signez dans le cadre prévu' using errcode = '22023';
  end if;
  perform public.assert_confirmed_file(p_signature_file_id, 'signature');
  perform public.apply_rental_signature(v_request, p_signer_name, p_signature_file_id);
  return jsonb_build_object('status', 'signed');
end;
$$;

-- L'OR ne se signe plus avec le lien d'un contrat (et inversement).
create or replace function public.public_sign_repair_order(
  p_token text,
  p_signer_name text,
  p_signature_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.signature_requests;
begin
  select * into v_request from public.signature_requests
  where public_token = p_token and channel = 'email' and repair_order_id is not null for update;
  if not found then
    raise exception 'Lien de signature inconnu' using errcode = 'P0002';
  end if;
  if v_request.status = 'signed' then
    raise exception 'Cet ordre de réparation est déjà signé' using errcode = 'P0001';
  end if;
  if v_request.status <> 'pending' or v_request.expires_at <= now() then
    raise exception 'Lien de signature expiré : contactez l''atelier' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_signer_name), '') = '' then
    raise exception 'Indiquez votre nom' using errcode = '22023';
  end if;
  if p_signature_file_id is null then
    raise exception 'Signez dans le cadre prévu' using errcode = '22023';
  end if;
  perform public.assert_confirmed_file(p_signature_file_id, 'signature');
  perform public.apply_repair_order_signature(v_request, p_signer_name, p_signature_file_id);
  return jsonb_build_object('status', 'signed');
end;
$$;

-- ---------------------------------------------------------------- Contrat lu par le client (sans compte)

-- Ce que le client voit de son contrat : jamais le permis ni les photos.
create or replace function public.rental_public_json(p_rental public.rentals)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'number', p_rental.number,
    'kind', p_rental.kind,
    'rental_status', p_rental.status,
    'created_at', p_rental.created_at,
    'client_name', (select name from public.clients where id = p_rental.client_id),
    'vehicle', (select jsonb_build_object('plate', plate, 'brand', brand, 'model', model, 'category', category)
                from public.fleet_vehicles where id = p_rental.fleet_vehicle_id),
    'departure_at', coalesce(p_rental.departed_at, p_rental.departure_at),
    'planned_return_at', p_rental.planned_return_at,
    'returned_at', p_rental.returned_at,
    'conditions', jsonb_build_object(
      'billable', p_rental.billable,
      'rate_period', p_rental.rate_period,
      'unit_price', p_rental.unit_price,
      'periods', p_rental.periods,
      'discount_percent', p_rental.discount_percent,
      'km_included', p_rental.km_included,
      'extra_km_price', p_rental.extra_km_price,
      'fuel_price_per_liter', p_rental.fuel_price_per_liter,
      'cleaning_fee', p_rental.cleaning_fee,
      'late_fee_per_hour', p_rental.late_fee_per_hour,
      'deposit', p_rental.deposit,
      'deposit_mode', p_rental.deposit_mode,
      'franchise', p_rental.franchise,
      'vat_rate', (select default_vat_rate from public.company_settings)),
    'departure_inspection', (
      select jsonb_build_object('mileage', mileage, 'fuel_eighths', fuel_eighths)
      from public.rental_inspections where rental_id = p_rental.id and phase = 'departure'),
    'departure_damages', coalesce((
      select jsonb_agg(label order by created_at)
      from public.rental_damages where rental_id = p_rental.id and phase = 'departure'), '[]'::jsonb),
    'signed_at', p_rental.signed_at,
    'signer_name', (select signer_name from public.signature_requests
                    where rental_id = p_rental.id and status = 'signed'
                      and signature_file_id = p_rental.signature_file_id
                    order by signed_at desc limit 1));
$$;

create or replace function public.public_get_document(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      'legal_mentions', (select to_jsonb(invoice_legal_mentions) from public.company_settings)
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

revoke execute on function
  public.request_rental_signature(uuid),
  public.rental_signature_request(uuid),
  public.share_rental(uuid),
  public.apply_rental_signature(public.signature_requests, text, uuid),
  public.public_sign_link(text, text, uuid),
  public.public_sign_repair_order(text, text, uuid),
  public.rental_public_json(public.rentals)
from public, anon, authenticated;
grant execute on function
  public.request_rental_signature(uuid),
  public.rental_signature_request(uuid),
  public.share_rental(uuid)
to authenticated;
grant execute on function
  public.public_sign_link(text, text, uuid),
  public.public_sign_repair_order(text, text, uuid)
to service_role;
