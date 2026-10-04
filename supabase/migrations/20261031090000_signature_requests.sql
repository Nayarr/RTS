-- =============================================================================
-- Signature du client sur l'OR (accord avant intervention), demandée depuis le bureau :
--   * client sur place : la demande s'affiche sur la borne (tablette) pendant 1 minute,
--     avec le temps restant ; le client signe sur l'écran de la borne ;
--   * client absent : lien de signature (valable 7 jours) envoyé par e-mail depuis le PC ;
--     le client signe sur la page publique, l'Edge Function « ro-signature » enregistre l'image.
-- La première signature reçue est gardée sur l'OR ; les autres demandes en cours sont annulées.
-- =============================================================================

create type public.signature_channel as enum ('kiosk', 'email');
create type public.signature_request_status as enum ('pending', 'signed', 'cancelled');

create table public.signature_requests (
  id                 uuid primary key default gen_random_uuid(),
  repair_order_id    uuid not null references public.repair_orders (id) on delete cascade,
  channel            public.signature_channel not null,
  status             public.signature_request_status not null default 'pending',
  public_token       text unique,                       -- lien envoyé au client (e-mail)
  expires_at         timestamptz not null,
  signer_name        text,
  signature_file_id  uuid references public.files (id) on delete restrict,
  signed_at          timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  constraint signature_requests_token_check check ((channel = 'email') = (public_token is not null))
);
create index signature_requests_ro_idx on public.signature_requests (repair_order_id, created_at desc);
create index signature_requests_pending_idx on public.signature_requests (channel, expires_at) where status = 'pending';
comment on table public.signature_requests is
  'Demandes de signature d''un OR par le client : sur la borne (1 minute) ou par lien e-mail (7 jours).';

-- Écriture uniquement par les fonctions ci-dessous (bureau, borne, Edge Function) ; lecture : le bureau.
alter table public.signature_requests enable row level security;
revoke all on public.signature_requests from public, anon, authenticated;
grant select on public.signature_requests to authenticated;
create policy signature_requests_select on public.signature_requests for select to authenticated
  using (public.is_office());

-- La borne envoie l'image de la signature du client.
create or replace function public.can_upload_file(p_category public.file_category)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case p_category
      when 'ro_photo'         then public.is_office() or public.current_technician_id() is not null
      when 'signature'        then public.is_office() or public.current_technician_id() is not null or public.is_kiosk()
      when 'registration_doc' then public.is_office() or public.current_technician_id() is not null
      when 'label_scan'       then public.is_office() or public.current_technician_id() is not null
      when 'clock_photo'      then public.is_kiosk()
      when 'document_pdf'     then public.is_office()
      when 'logo'             then public.is_direction()
      when 'other'            then public.is_office()
    end, false);
$$;

-- État d'une demande vu par le bureau (une demande en attente dont le délai est passé est « expirée »).
create or replace function public.signature_request_json(p_request public.signature_requests)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_request.id,
    'channel', p_request.channel,
    'status', case when p_request.status = 'pending' and p_request.expires_at <= now() then 'expired'
                   else p_request.status::text end,
    'token', p_request.public_token,
    'expires_at', p_request.expires_at,
    'seconds_left', greatest(0, ceil(extract(epoch from p_request.expires_at - now())))::integer,
    'signer_name', p_request.signer_name,
    'signed_at', p_request.signed_at,
    'created_at', p_request.created_at);
$$;

-- Bureau : demande la signature du client, sur la borne ou par lien e-mail.
create or replace function public.request_repair_order_signature(p_repair_order_id uuid, p_channel public.signature_channel)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_request public.signature_requests;
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id for update;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;
  if v_ro.customer_signature_file_id is not null then
    raise exception 'Le client a déjà signé cet OR' using errcode = 'P0001';
  end if;
  if v_ro.status = 'invoiced' then
    raise exception 'OR facturé : signature inutile' using errcode = 'P0001';
  end if;

  if p_channel = 'email' then
    -- Lien déjà envoyé et toujours valable : le même lien est repris.
    select * into v_request from public.signature_requests
    where repair_order_id = p_repair_order_id and channel = 'email' and status = 'pending' and expires_at > now()
    order by created_at desc limit 1;
    if found then
      return public.signature_request_json(v_request);
    end if;
  else
    -- Une seule demande à la fois sur la borne pour cet OR.
    update public.signature_requests set status = 'cancelled'
    where repair_order_id = p_repair_order_id and channel = 'kiosk' and status = 'pending';
  end if;

  insert into public.signature_requests (repair_order_id, channel, public_token, expires_at, created_by)
  values (p_repair_order_id, p_channel,
          case when p_channel = 'email' then public.generate_public_token() end,
          now() + case when p_channel = 'kiosk' then interval '1 minute' else interval '7 days' end,
          auth.uid())
  returning * into v_request;

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id,
          case when p_channel = 'kiosk' then 'Signature du client demandée sur la borne'
               else 'Lien de signature préparé pour le client (e-mail)' end,
          auth.uid());
  return public.signature_request_json(v_request);
end;
$$;

-- Bureau : annule une demande en attente.
create or replace function public.cancel_signature_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_office();
  update public.signature_requests set status = 'cancelled' where id = p_request_id and status = 'pending';
end;
$$;

-- Bureau : dernière demande de signature de l'OR (suivi en direct de la borne).
create or replace function public.repair_order_signature_request(p_repair_order_id uuid)
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
  where repair_order_id = p_repair_order_id
  order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  return public.signature_request_json(v_request);
end;
$$;

-- Borne : demande en cours à afficher (la plus ancienne encore valable).
create or replace function public.kiosk_pending_signature()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_request public.signature_requests;
  v_ro public.repair_orders;
begin
  if not public.is_kiosk() then
    raise exception 'Accès réservé à la borne' using errcode = '42501';
  end if;
  select * into v_request from public.signature_requests
  where channel = 'kiosk' and status = 'pending' and expires_at > now()
  order by created_at limit 1;
  if not found then
    return null;
  end if;
  select * into v_ro from public.repair_orders where id = v_request.repair_order_id;
  return public.signature_request_json(v_request) || jsonb_build_object(
    'number', v_ro.number,
    'vehicle_plate', (select plate from public.vehicles where id = v_ro.vehicle_id),
    'client_name', (select name from public.clients where id = v_ro.client_id),
    'requested_work', v_ro.requested_work);
end;
$$;

-- Signature reçue : gardée sur l'OR, demande close, autres demandes annulées, bureau prévenu.
create or replace function public.apply_repair_order_signature(
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
  v_ro public.repair_orders;
  v_plate text;
begin
  select * into v_ro from public.repair_orders where id = p_request.repair_order_id for update;
  if v_ro.customer_signature_file_id is not null then
    raise exception 'Le client a déjà signé cet OR' using errcode = 'P0001';
  end if;

  perform set_config('rts.system', 'on', true);
  update public.repair_orders set customer_signature_file_id = p_signature_file_id where id = v_ro.id;
  perform set_config('rts.system', '', true);

  update public.signature_requests
     set status = 'signed', signed_at = now(), signer_name = nullif(btrim(p_signer_name), ''),
         signature_file_id = p_signature_file_id
   where id = p_request.id;
  update public.signature_requests set status = 'cancelled'
   where repair_order_id = v_ro.id and status = 'pending' and id <> p_request.id;

  insert into public.ro_events (repair_order_id, label)
  values (v_ro.id,
          case when p_request.channel = 'kiosk' then 'Signé par le client sur la borne'
               else 'Signé en ligne par le client (lien e-mail)' end
            || coalesce(' : ' || nullif(btrim(p_signer_name), ''), ''));

  select plate into v_plate from public.vehicles where id = v_ro.vehicle_id;
  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  select role, 'signature_received', 'Signature reçue : ' || coalesce(v_plate, v_ro.number),
         'OR ' || v_ro.number || case when p_request.channel = 'kiosk' then ' · signé sur la borne'
                                      else ' · signé en ligne' end,
         v_ro.id, '/or/' || v_ro.id, 'signature-' || p_request.id || '-' || role
  from (values ('direction'::public.app_role), ('reception'::public.app_role)) roles(role)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- Borne : le client a signé (un petit délai après la minute laisse finir l'envoi de l'image).
create or replace function public.kiosk_sign_repair_order(
  p_request_id uuid,
  p_signer_name text,
  p_signature_file_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.signature_requests;
begin
  if not public.is_kiosk() then
    raise exception 'Accès réservé à la borne' using errcode = '42501';
  end if;
  select * into v_request from public.signature_requests where id = p_request_id and channel = 'kiosk' for update;
  if not found or v_request.status <> 'pending' or v_request.expires_at + interval '15 seconds' < now() then
    raise exception 'Demande de signature expirée : demandez à l''accueil de la relancer' using errcode = 'P0001';
  end if;
  if p_signature_file_id is null then
    raise exception 'Signez dans le cadre prévu' using errcode = '22023';
  end if;
  perform public.assert_confirmed_file(p_signature_file_id, 'signature');
  perform public.apply_repair_order_signature(v_request, p_signer_name, p_signature_file_id);
end;
$$;

-- Lien e-mail : signature du client. Appelée uniquement par l'Edge Function (qui range l'image).
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
  where public_token = p_token and channel = 'email' for update;
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

-- Lecture publique : le lien e-mail ouvre la demande de signature.
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

  return null;
end;
$$;

revoke execute on function
  public.signature_request_json(public.signature_requests),
  public.request_repair_order_signature(uuid, public.signature_channel),
  public.cancel_signature_request(uuid),
  public.repair_order_signature_request(uuid),
  public.kiosk_pending_signature(),
  public.apply_repair_order_signature(public.signature_requests, text, uuid),
  public.kiosk_sign_repair_order(uuid, text, uuid),
  public.public_sign_repair_order(text, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.request_repair_order_signature(uuid, public.signature_channel),
  public.cancel_signature_request(uuid),
  public.repair_order_signature_request(uuid),
  public.kiosk_pending_signature(),
  public.kiosk_sign_repair_order(uuid, text, uuid)
to authenticated;
grant execute on function public.public_sign_repair_order(text, text, uuid) to service_role;
