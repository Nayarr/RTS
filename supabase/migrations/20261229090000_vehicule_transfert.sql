-- =============================================================================
-- Transfert d'un véhicule à un autre client (camion racheté par une autre société)
--
-- Demande du client : un camion de la société A est racheté par la société B, toutes deux
-- clientes. Le bureau transfère le véhicule depuis sa fiche : il passe chez B, son historique
-- reste entier sur la fiche véhicule. Les OR, devis et factures déjà faits restent ceux de A
-- (A les a commandés et payés). A sort du contrat d'entretien qui couvrait le véhicule et perd
-- ses liens de prise de rendez-vous pour ce véhicule ; son portail ne montre plus le véhicule
-- (sauf un OR de A encore en cours), ni l'état de l'atelier pour un OR de B.
-- =============================================================================

create table public.vehicle_owner_changes (
  id               uuid primary key default gen_random_uuid(),
  vehicle_id       uuid not null references public.vehicles (id) on delete cascade,
  from_client_id   uuid references public.clients (id) on delete set null,
  to_client_id     uuid references public.clients (id) on delete set null,
  -- Noms au moment du transfert : l'historique reste lisible si une fiche est supprimée
  from_client_name text,
  to_client_name   text,
  note             text,
  changed_at       timestamptz not null default now(),
  changed_by       uuid references public.profiles (id) on delete set null default auth.uid()
);
comment on table public.vehicle_owner_changes is 'Propriétaires successifs d''un véhicule (transferts entre clients).';
create index vehicle_owner_changes_vehicle_idx on public.vehicle_owner_changes (vehicle_id, changed_at);
create index vehicle_owner_changes_from_idx on public.vehicle_owner_changes (from_client_id);
create index vehicle_owner_changes_to_idx on public.vehicle_owner_changes (to_client_id);

alter table public.vehicle_owner_changes enable row level security;
create policy vehicle_owner_changes_select on public.vehicle_owner_changes for select to authenticated
  using (public.is_office());
revoke all on public.vehicle_owner_changes from anon;
grant select on public.vehicle_owner_changes to authenticated;

-- Tout changement de client d'un véhicule est noté (transfert ou fiche modifiée à la main)
create function public.vehicles_owner_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vehicle_owner_changes
    (vehicle_id, from_client_id, to_client_id, from_client_name, to_client_name, note)
  values (new.id, old.client_id, new.client_id,
          (select name from public.clients where id = old.client_id),
          (select name from public.clients where id = new.client_id),
          nullif(btrim(coalesce(current_setting('rts.transfer_note', true), '')), ''));
  return null;
end;
$$;
revoke execute on function public.vehicles_owner_change() from public, anon, authenticated;

create trigger vehicles_owner_change
  after update of client_id on public.vehicles
  for each row when (old.client_id is distinct from new.client_id)
  execute function public.vehicles_owner_change();

-- Transférer un véhicule à un autre client (bureau)
create function public.transfer_vehicle(p_vehicle_id uuid, p_client_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
  v_client public.clients;
begin
  perform public.assert_office();
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'Véhicule introuvable' using errcode = 'P0002';
  end if;
  select * into v_client from public.clients where id = p_client_id;
  if not found then
    raise exception 'Client introuvable' using errcode = 'P0002';
  end if;
  if v_client.archived_at is not null then
    raise exception 'Le client % est archivé : restaure-le avant de lui transférer un véhicule', v_client.name
      using errcode = 'P0001';
  end if;
  if v_vehicle.client_id is not distinct from p_client_id then
    raise exception 'Ce véhicule est déjà au client %', v_client.name using errcode = 'P0001';
  end if;

  if v_vehicle.client_id is not null then
    -- L'ancien propriétaire n'a plus ce véhicule sous contrat, ni de lien pour le faire venir
    delete from public.maintenance_contract_vehicles mcv
     using public.maintenance_contracts mc
     where mc.id = mcv.contract_id and mc.client_id = v_vehicle.client_id and mcv.vehicle_id = p_vehicle_id;
    delete from public.booking_links where vehicle_id = p_vehicle_id and client_id = v_vehicle.client_id;
  end if;

  perform set_config('rts.transfer_note', coalesce(p_note, ''), true);
  update public.vehicles set client_id = p_client_id, archived_at = null where id = p_vehicle_id;
  perform set_config('rts.transfer_note', '', true);
end;
$$;
revoke execute on function public.transfer_vehicle(uuid, uuid, text) from public, anon;
grant execute on function public.transfer_vehicle(uuid, uuid, text) to authenticated;

-- Portail client : véhicules du client, ou d'un autre avec un OR du client encore en cours ;
-- l'état de l'atelier ne montre que les OR du client
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
