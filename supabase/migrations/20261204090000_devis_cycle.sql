-- =============================================================================
-- Devis et cycle des OR
-- =============================================================================
-- - OR créé depuis un devis accepté : les pièces ne sont plus recopiées dans les tâches à faire.
-- - OR créé à l'arrivée d'un rendez-vous : « tous les contrôles obligatoires » au choix.
-- - Travaux terminés par le technicien (sans devis) : « Facture à faire » directement.
-- - Devis accepté : l'OR d'origine quitte « Devis à faire » pour « Facture à faire ».

create or replace function public.create_repair_order_from_quote(
  p_quote_id uuid,
  p_technician_id uuid default null,
  p_planned_date date default null,
  p_planned_start time default null,
  p_planned_end time default null,
  p_inspection_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_ro_id uuid;
  v_summary text;
  v_standalone boolean;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;

  v_standalone := v_quote.repair_order_id is null;
  if not v_standalone then
    if v_quote.status <> 'accepted' then
      raise exception 'Le devis doit être accepté avant de créer l''OR' using errcode = 'P0001';
    end if;
    if v_quote.resulting_repair_order_id is not null then
      raise exception 'Un OR a déjà été créé pour ce devis' using errcode = 'P0001';
    end if;
  end if;
  if v_quote.vehicle_id is null then
    raise exception 'Renseigne l''immatriculation avant de créer l''OR' using errcode = 'P0001';
  end if;
  if v_quote.merged_into_repair_order_id is not null then
    raise exception 'Ce devis a déjà été rattaché à un OR' using errcode = 'P0001';
  end if;
  if p_planned_end is not null and (p_planned_start is null or p_planned_end <= p_planned_start) then
    raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
  end if;

  select string_agg(split_part(description, E'\n', 1), E'\n' order by position) into v_summary
  from public.quote_lines where quote_id = p_quote_id and section = 'planned'
    -- Tâches à faire : main d'œuvre et forfaits ; les pièces restent dans les pièces de l'OR
    and line_type not in ('text', 'consumable', 'part');

  -- Technicien et date posés dès la création : la notification au technicien annonce le début prévu.
  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    planned_date, planned_start, planned_end,
                                    origin_repair_order_id, origin_quote_id, inspection_required)
  values (v_quote.vehicle_id, v_quote.client_id, v_quote.vehicle_type, p_technician_id,
          coalesce(nullif(v_summary, ''), 'Travaux issus du devis ' || coalesce(v_quote.number, '')),
          case when p_planned_start is not null then coalesce(p_planned_date, current_date) else p_planned_date end,
          p_planned_start, p_planned_end,
          v_quote.repair_order_id, v_quote.id, coalesce(p_inspection_required, false))
  returning id into v_ro_id;

  perform set_config('rts.system', 'on', true);
  -- Travaux du devis -> travaux effectués : facturés au temps du devis, temps réel à saisir par le technicien
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours, standard_hours,
                               billed_hours, labor_category, unit_price, quantity, discount_percent, package_id,
                               source_quote_line_id)
  select v_ro_id, 'done', ql.position, ql.line_type, ql.description,
         -- Temps réel : saisi par le technicien (exigé avant « Travaux terminés »)
         null,
         ql.standard_hours,
         -- Facturation : le temps du devis accepté, quel que soit le temps réel
         case when ql.line_type in ('labor', 'package')
              then coalesce(ql.billed_hours, ql.standard_hours, ql.estimated_hours) end,
         ql.labor_category, ql.unit_price, ql.quantity, ql.discount_percent, ql.package_id,
         ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type in ('labor', 'package', 'text');
  -- Pièces : à commander, comme avant
  insert into public.ro_lines (repair_order_id, kind, position, line_type, description, quantity, unit_price,
                               discount_percent, part_id, supplier_id, purchase_price, shipping_cost, brand,
                               manufacturer_ref, oem_ref, order_status, source_quote_line_id)
  select v_ro_id, 'planned', ql.position, ql.line_type, ql.description, ql.quantity, ql.unit_price,
         ql.discount_percent, ql.part_id, ql.supplier_id, ql.purchase_price, ql.shipping_cost, ql.brand,
         ql.manufacturer_ref, ql.oem_ref, 'to_order'::public.part_order_status, ql.id
  from public.quote_lines ql
  where ql.quote_id = p_quote_id and ql.section = 'planned' and ql.line_type = 'part';
  perform set_config('rts.system', '', true);

  if v_standalone then
    update public.quotes set repair_order_id = v_ro_id where id = p_quote_id;
  else
    update public.quotes set resulting_repair_order_id = v_ro_id where id = p_quote_id;
    insert into public.ro_events (repair_order_id, label, actor_id)
    select v_quote.repair_order_id,
           'Devis accepté · nouvel OR ' || r.number || ' créé', auth.uid()
    from public.repair_orders r where r.id = v_ro_id;
  end if;
  return v_ro_id;
end;
$$;

-- ---------------------------------------------------------------------------
drop function public.create_repair_order_from_appointment(uuid);
create function public.create_repair_order_from_appointment(
  p_appointment_id uuid,
  p_inspection_required boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments;
  v_ro_id uuid;
begin
  perform public.assert_office();
  select * into v_appt from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'Rendez-vous introuvable' using errcode = 'P0002';
  end if;
  if v_appt.status <> 'planned' then
    raise exception 'Ce rendez-vous n''est plus à venir' using errcode = 'P0001';
  end if;
  if v_appt.vehicle_id is null then
    raise exception 'Renseigne l''immatriculation du rendez-vous avant de créer l''OR' using errcode = 'P0001';
  end if;

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, technician_id, requested_work,
                                    planned_date, planned_start, planned_end, appointment_id, maintenance_contract_id,
                                    created_by, inspection_required)
  values (v_appt.vehicle_id, v_appt.client_id, v_appt.vehicle_type, v_appt.technician_id,
          coalesce(nullif(v_appt.reason, ''), 'Rendez-vous'),
          v_appt.scheduled_date, v_appt.start_time, v_appt.end_time, v_appt.id, v_appt.maintenance_contract_id,
          auth.uid(), coalesce(p_inspection_required, false))
  returning id into v_ro_id;

  update public.appointments set status = 'converted', repair_order_id = v_ro_id where id = p_appointment_id;
  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_ro_id, 'OR créé depuis le rendez-vous du ' || to_char(v_appt.scheduled_date, 'DD/MM/YYYY'), auth.uid());
  return v_ro_id;
end;
$$;
revoke execute on function public.create_repair_order_from_appointment(uuid, boolean) from public, anon;
grant execute on function public.create_repair_order_from_appointment(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Travaux terminés par le technicien (sans devis) : directement « Facture à faire ».
-- Le bureau garde la main : un statut choisi à la main n'est pas changé.
create function public.repair_orders_done_to_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'work_done' and old.status in ('assigned', 'in_progress') then
    new.status := 'to_invoice';
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;
revoke execute on function public.repair_orders_done_to_invoice() from public, anon, authenticated;

create trigger repair_orders_done_to_invoice
  before update of status on public.repair_orders
  for each row execute function public.repair_orders_done_to_invoice();

-- Devis accepté (en ligne, sur la borne ou au bureau) : l'OR d'origine passe « Facture à faire »
-- (travaux déjà faits à facturer ou offrir, ou OR à clôturer).
create function public.quotes_accepted_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.repair_order_id is not null then
    update public.repair_orders set status = 'to_invoice'
    where id = new.repair_order_id and status = 'quote_pending';
  end if;
  return null;
end;
$$;
revoke execute on function public.quotes_accepted_order_status() from public, anon, authenticated;

create trigger quotes_accepted_order_status
  after update of status on public.quotes
  for each row execute function public.quotes_accepted_order_status();

-- ---------------------------------------------------------------------------
-- Dupliquer un devis, un OR, une facture (bureau) : la copie repart en brouillon.
-- ---------------------------------------------------------------------------

-- Devis : même client, véhicule et lignes, rattaché au même OR ; numéro donné à l'envoi.
create function public.duplicate_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_id uuid;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;

  insert into public.quotes (client_id, vehicle_id, vehicle_type, repair_order_id, notes, created_by)
  values (v_quote.client_id, v_quote.vehicle_id, v_quote.vehicle_type, v_quote.repair_order_id, v_quote.notes,
          auth.uid())
  returning id into v_id;

  insert into public.quote_lines (quote_id, section, position, line_type, description, quantity, unit_price,
                                  discount_percent, vat_rate, labor_category, package_id, part_id, purchase_price,
                                  shipping_cost, brand, manufacturer_ref, oem_ref, supplier_id, standard_hours,
                                  estimated_hours, billed_hours)
  select v_id, section, position, line_type, description, quantity, unit_price, discount_percent, vat_rate,
         labor_category, package_id, part_id, purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref,
         supplier_id, standard_hours, estimated_hours, billed_hours
  from public.quote_lines where quote_id = p_quote_id
  order by position;
  return v_id;
end;
$$;
revoke execute on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.duplicate_quote(uuid) to authenticated;

-- OR : même véhicule, client, tâches à faire et type d'intervention ; ni technicien, ni photos,
-- ni fiche de contrôle, ni temps, ni pièces, ni signature.
create function public.duplicate_repair_order(p_repair_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_id uuid;
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    raise exception 'OR introuvable' using errcode = 'P0002';
  end if;

  insert into public.repair_orders (vehicle_id, client_id, vehicle_type, requested_work, intervention_type,
                                    roadside_address, roadside_km, roadside_travel_hours, created_by)
  values (v_ro.vehicle_id, v_ro.client_id, v_ro.vehicle_type, v_ro.requested_work, v_ro.intervention_type,
          v_ro.roadside_address, v_ro.roadside_km, v_ro.roadside_travel_hours, auth.uid())
  returning id into v_id;

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (v_id, 'OR créé en dupliquant ' || v_ro.number, auth.uid());
  return v_id;
end;
$$;
revoke execute on function public.duplicate_repair_order(uuid) from public, anon;
grant execute on function public.duplicate_repair_order(uuid) to authenticated;

-- Facture : brouillon avec le même client et les mêmes lignes, rattaché aux mêmes OR (un OR déjà
-- facturé demande d'abord un avoir, comme toujours).
create function public.duplicate_invoice(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_id uuid;
begin
  perform public.assert_office();
  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;

  insert into public.invoices (client_id, vehicle_label, mileage, maintenance_contract_id, created_by)
  values (v_invoice.client_id, v_invoice.vehicle_label, v_invoice.mileage, v_invoice.maintenance_contract_id,
          auth.uid())
  returning id into v_id;

  insert into public.invoice_repair_orders (invoice_id, repair_order_id)
  select v_id, repair_order_id from public.invoice_repair_orders where invoice_id = p_invoice_id;

  insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, quantity,
                                    unit_price, discount_percent, vat_rate, labor_category, package_id, part_id,
                                    purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref, supplier_id,
                                    standard_hours, billed_hours)
  select v_id, repair_order_id, position, line_type, description, quantity, unit_price, discount_percent, vat_rate,
         labor_category, package_id, part_id, purchase_price, shipping_cost, brand, manufacturer_ref, oem_ref,
         supplier_id, standard_hours, billed_hours
  from public.invoice_lines where invoice_id = p_invoice_id
  order by position;
  return v_id;
end;
$$;
revoke execute on function public.duplicate_invoice(uuid) from public, anon;
grant execute on function public.duplicate_invoice(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Signature d'un devis sur la borne (client sur place), comme pour l'OR : 1 minute.
-- ---------------------------------------------------------------------------
alter table public.signature_requests
  add column quote_id uuid references public.quotes (id) on delete cascade,
  drop constraint signature_requests_target_check,
  add constraint signature_requests_target_check check (num_nonnulls(repair_order_id, rental_id, quote_id) = 1),
  -- Devis : sur la borne seulement (le lien en ligne du devis sert au client absent)
  add constraint signature_requests_quote_channel_check check (quote_id is null or channel = 'kiosk');
create index signature_requests_quote_idx on public.signature_requests (quote_id, created_at desc)
  where quote_id is not null;
comment on table public.signature_requests is
  'Demandes de signature par le client : OR (borne 1 minute ou lien e-mail 7 jours), devis (borne 1 minute) ou contrat de location (lien e-mail 7 jours).';

-- Bureau : affiche le devis sur la borne pour que le client présent le signe.
create function public.request_quote_signature(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_request public.signature_requests;
begin
  perform public.assert_office();
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_quote.status in ('accepted', 'refused') then
    raise exception 'Ce devis a déjà reçu une réponse' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.quote_lines where quote_id = p_quote_id and line_type <> 'text' and net_ht > 0) then
    raise exception 'Le devis est vide' using errcode = 'P0001';
  end if;

  -- Numéro donné comme à l'envoi ; devis présenté au client
  perform public.assign_quote_number(p_quote_id, false);
  update public.quotes set status = 'sent', sent_at = coalesce(sent_at, now()) where id = p_quote_id;
  update public.signature_requests set status = 'cancelled'
  where quote_id = p_quote_id and channel = 'kiosk' and status = 'pending';

  insert into public.signature_requests (quote_id, channel, expires_at, created_by)
  values (p_quote_id, 'kiosk', now() + interval '1 minute', auth.uid())
  returning * into v_request;
  return public.signature_request_json(v_request);
end;
$$;
revoke execute on function public.request_quote_signature(uuid) from public, anon;
grant execute on function public.request_quote_signature(uuid) to authenticated;

-- Bureau : dernière demande de signature du devis (suivi en direct de la borne).
create function public.quote_signature_request(p_quote_id uuid)
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
  where quote_id = p_quote_id
  order by created_at desc limit 1;
  if not found then
    return null;
  end if;
  return public.signature_request_json(v_request);
end;
$$;
revoke execute on function public.quote_signature_request(uuid) from public, anon;
grant execute on function public.quote_signature_request(uuid) to authenticated;

-- Signature du devis reçue sur la borne : devis accepté avec la signature, bureau prévenu.
create function public.apply_quote_kiosk_signature(
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
  v_quote public.quotes;
  v_title text;
  v_body text;
begin
  select * into v_quote from public.quotes where id = p_request.quote_id for update;
  if v_quote.status in ('accepted', 'refused') then
    raise exception 'Ce devis a déjà reçu une réponse' using errcode = 'P0001';
  end if;

  update public.quotes
     set status = 'accepted', accepted_at = now(),
         accepted_by_name = coalesce(nullif(btrim(p_signer_name), ''), 'Client sur place'),
         signature_file_id = p_signature_file_id
   where id = v_quote.id;
  update public.signature_requests
     set status = 'signed', signed_at = now(), signer_name = nullif(btrim(p_signer_name), ''),
         signature_file_id = p_signature_file_id
   where id = p_request.id;

  if v_quote.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label)
    values (v_quote.repair_order_id,
            'Devis ' || v_quote.number || ' accepté et signé sur la borne'
            || coalesce(' (' || nullif(btrim(p_signer_name), '') || ')', ''));
  end if;

  v_title := 'Devis ' || v_quote.number || ' accepté sur la borne';
  select coalesce(c.name, '') || coalesce(' · ' || v.plate, '') into v_body
  from public.quotes q left join public.clients c on c.id = q.client_id left join public.vehicles v on v.id = q.vehicle_id
  where q.id = v_quote.id;
  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  select role, 'quote_response', v_title, v_body, v_quote.repair_order_id, '/devis/' || v_quote.id,
         'quote-response-' || v_quote.id || '-' || role
  from (values ('direction'::public.app_role), ('reception'::public.app_role)) roles(role)
  on conflict (dedupe_key) do nothing;
end;
$$;
revoke execute on function public.apply_quote_kiosk_signature(public.signature_requests, text, uuid) from public, anon, authenticated;

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
  v_quote public.v_quotes_overview;
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
  -- Devis à signer : numéro, véhicule, client, travaux prévus et total TTC
  if v_request.quote_id is not null then
    select * into v_quote from public.v_quotes_overview where id = v_request.quote_id;
    return public.signature_request_json(v_request) || jsonb_build_object(
      'kind', 'quote',
      'number', v_quote.number,
      'vehicle_plate', v_quote.plate,
      'client_name', v_quote.client_name,
      'total_ttc', v_quote.total_ttc,
      'requested_work', (select string_agg(split_part(description, E'\n', 1), E'\n' order by section desc, position)
                         from public.quote_lines
                         where quote_id = v_request.quote_id and line_type not in ('text', 'consumable')));
  end if;
  select * into v_ro from public.repair_orders where id = v_request.repair_order_id;
  return public.signature_request_json(v_request) || jsonb_build_object(
    'kind', 'repair_order',
    'number', v_ro.number,
    'vehicle_plate', (select plate from public.vehicles where id = v_ro.vehicle_id),
    'client_name', (select name from public.clients where id = v_ro.client_id),
    'requested_work', v_ro.requested_work);
end;
$$;

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
  if v_request.quote_id is not null then
    perform public.apply_quote_kiosk_signature(v_request, p_signer_name, p_signature_file_id);
  else
    perform public.apply_repair_order_signature(v_request, p_signer_name, p_signature_file_id);
  end if;
end;
$$;
