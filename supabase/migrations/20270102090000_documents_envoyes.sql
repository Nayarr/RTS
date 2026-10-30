-- =============================================================================
-- Devis envoyés, factures envoyées
--
-- Demande du client : une catégorie « Devis envoyé » et une catégorie « Facture envoyée »,
-- dans la liste des OR comme dans les listes des devis et des factures.
--   - Facture : date du premier envoi au client (lien préparé, envoi par l'appli, relance) ;
--     reprise pour les factures déjà partagées (date d'émission).
--   - OR : « Devis envoyé » quand son devis attend la réponse du client, « Facture envoyée »
--     quand sa facture est partie (colonnes quote_sent / invoice_sent de la vue).
-- =============================================================================

alter table public.invoices add column sent_at timestamptz;
comment on column public.invoices.sent_at is 'Premier envoi de la facture au client (lien, mail, relance).';

-- Factures déjà partagées avant cette version (le lien n'est créé qu'à l'envoi)
update public.invoices set sent_at = issued_at where public_token is not null and sent_at is null;
update public.invoices i set sent_at = r.first_sent
  from (select invoice_id, min(sent_at) as first_sent from public.invoice_reminders group by 1) r
 where r.invoice_id = i.id and i.sent_at is null;

-- ---------------------------------------------------------------------------
-- Facture émise : la date d'envoi reste modifiable (comme le lien)
-- ---------------------------------------------------------------------------
create or replace function public.invoices_guard()
returns trigger
language plpgsql
as $$
declare
  v_mutable text[] := array['public_token', 'pdf_file_id', 'updated_at', 'sent_at'];
begin
  if public.is_migration_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.number is not null then
      raise exception 'Une facture est créée en brouillon puis émise via issue_invoice' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'Une facture émise ne peut pas être supprimée (faire un avoir)' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'issued' then
    if coalesce(current_setting('rts.due_date_change', true), '') = 'on' then
      v_mutable := v_mutable || array['due_date'];
    end if;
    if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
      raise exception 'Une facture émise ne peut plus être modifiée (faire un avoir)' using errcode = '42501';
    end if;
  elsif new.status = 'issued' or new.number is not null then
    if coalesce(current_setting('rts.issuing', true), '') <> 'on' then
      raise exception 'L''émission d''une facture passe par issue_invoice' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Envoi : lien préparé pour le client (mail, SMS) ou relance
-- ---------------------------------------------------------------------------
create or replace function public.share_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.assert_office();
  update public.invoices
     set public_token = coalesce(public_token, public.generate_public_token()),
         sent_at = coalesce(sent_at, now())
   where id = p_invoice_id and status = 'issued'
  returning public_token into v_token;
  if v_token is null then
    raise exception 'Seule une facture émise peut être envoyée' using errcode = 'P0001';
  end if;
  return v_token;
end;
$$;

-- Relance (appli ou Agent Direction) : la facture est forcément partie
create function public.invoice_reminders_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invoices set sent_at = coalesce(sent_at, new.sent_at)
   where id = new.invoice_id and sent_at is null;
  return null;
end;
$$;
revoke execute on function public.invoice_reminders_sent() from public, anon, authenticated;

create trigger invoice_reminders_sent
  after insert on public.invoice_reminders
  for each row execute function public.invoice_reminders_sent();

-- ---------------------------------------------------------------------------
-- Vues : date d'envoi de la facture, devis et facture envoyés de l'OR
-- ---------------------------------------------------------------------------
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
    COALESCE(rm.count, (0)::bigint) AS reminders_count,
    rm.last_sent_at AS last_reminder_at,
    i.vat_exempt,
    i.client_vat_number,
    i.vat_exempt_mention,
    i.sent_at
   FROM (((((invoices i
     LEFT JOIN clients c ON ((c.id = i.client_id)))
     JOIN v_invoice_totals t ON ((t.invoice_id = i.id)))
     LEFT JOIN v_invoice_balances b ON ((b.invoice_id = i.id)))
     LEFT JOIN LATERAL ( SELECT array_agg(r.id ORDER BY r.number) AS ids,
            array_agg(r.number ORDER BY r.number) AS numbers
           FROM (invoice_repair_orders iro
             JOIN repair_orders r ON ((r.id = iro.repair_order_id)))
          WHERE (iro.invoice_id = i.id)) ro ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS count,
            max(invoice_reminders.sent_at) AS last_sent_at
           FROM invoice_reminders
          WHERE (invoice_reminders.invoice_id = i.id)) rm ON (true));

create or replace view public.v_repair_orders_overview
with (security_invoker = on) as
 SELECT r.id,
    r.number,
    r.status,
    r.vehicle_id,
    r.client_id,
    r.vehicle_type,
    r.mileage,
    r.requested_work,
    r.technician_id,
    r.planned_date,
    r.planned_start,
    r.planned_end,
    r.customer_signature_file_id,
    r.intervention_type,
    r.roadside_address,
    r.roadside_km,
    r.roadside_travel_hours,
    r.origin_repair_order_id,
    r.origin_quote_id,
    r.appointment_id,
    r.maintenance_contract_id,
    r.assignment_changed_at,
    r.completed_at,
    r.created_by,
    r.legacy_id,
    r.created_at,
    r.updated_at,
    r.pre_quote_work_settled_at,
    r.inspection_required,
    v.plate,
    v.plate_key,
    c.name AS client_name,
    t.display_name AS technician_name,
    t.color AS technician_color,
    tm.worked_seconds,
    tm.running_since,
    ( SELECT count(*) AS count
           FROM ro_lines l
          WHERE ((l.repair_order_id = r.id) AND (l.line_type = 'part'::line_type) AND (l.order_status <> 'received'::part_order_status))) AS parts_pending_count,
    ( SELECT count(*) AS count
           FROM ro_lines l
          WHERE ((l.repair_order_id = r.id) AND (l.line_type = 'part'::line_type) AND (l.order_status = 'to_order'::part_order_status))) AS parts_to_order_count,
    ( SELECT COALESCE(array_agg(lbl.lbl), '{}'::text[]) AS "coalesce"
           FROM unnest(required_photo_labels(r.vehicle_type)) lbl(lbl)
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM ro_photos p
                  WHERE ((p.repair_order_id = r.id) AND (p.label = lbl.lbl)))))) AS missing_photo_labels,
    ( SELECT COALESCE(sum(l.estimated_hours), (0)::numeric) AS "coalesce"
           FROM ro_lines l
          WHERE ((l.repair_order_id = r.id) AND (l.kind = 'done'::ro_line_kind))) AS declared_hours,
    (EXISTS ( SELECT 1
           FROM quotes q
          WHERE ((q.repair_order_id = r.id) AND (q.status = 'sent'::quote_status)))) AS quote_sent,
    (EXISTS ( SELECT 1
           FROM (invoice_repair_orders iro
             JOIN invoices i ON ((i.id = iro.invoice_id)))
          WHERE ((iro.repair_order_id = r.id) AND (i.sent_at IS NOT NULL)))) AS invoice_sent
   FROM ((((repair_orders r
     JOIN vehicles v ON ((v.id = r.vehicle_id)))
     LEFT JOIN clients c ON ((c.id = r.client_id)))
     LEFT JOIN technicians t ON ((t.id = r.technician_id)))
     LEFT JOIN v_repair_order_time tm ON ((tm.repair_order_id = r.id)));

-- ---------------------------------------------------------------------------
-- Tableau de bord : OR dont le devis est parti comptés à part (« Devis envoyé »)
-- ---------------------------------------------------------------------------
create or replace function public.office_dashboard()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
begin
  if not public.is_office() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'repair_orders', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (
        -- OR créé sans technicien : compté à part (« unassigned »), pas avec les OR assignés ;
        -- devis à faire déjà envoyé au client : « quote_sent »
        select case when r.status = 'assigned' and r.technician_id is null then 'unassigned'
                    when r.status = 'quote_pending'
                         and exists (select 1 from public.quotes q
                                     where q.repair_order_id = r.id and q.status = 'sent') then 'quote_sent'
                    else r.status::text end as status,
               count(*) as total
        from public.repair_orders r where r.status <> 'invoiced' group by 1
      ) s),
    'parts_to_order', (
      select count(*) from public.ro_lines l join public.repair_orders r on r.id = l.repair_order_id
      where l.line_type = 'part' and l.order_status = 'to_order' and r.status <> 'invoiced'),
    'quotes_awaiting_response', (select count(*) from public.quotes where status = 'sent'),
    'quotes_to_convert', (
      select count(*) from public.quotes
      where status = 'accepted' and resulting_repair_order_id is null and merged_into_repair_order_id is null),
    'overdue_invoices', (
      select jsonb_build_object('count', count(*), 'balance_due', coalesce(sum(balance_due), 0))
      from public.v_invoice_balances where payment_status = 'overdue'),
    'appointments_today', (
      select count(*) from public.appointments where status = 'planned' and scheduled_date = v_today),
    'reminders_to_send', (
      select count(*) from public.appointments
      where status = 'planned' and scheduled_date = v_today + 1 and reminder_sent_at is null),
    'leave_requests', (
      select count(*) from public.leave_requests where status = 'requested' and not is_deleted),
    'workload', (
      select coalesce(jsonb_agg(w order by w.sort_order, w.name), '[]'::jsonb)
      from (
        select t.id as technician_id, t.display_name as name, t.color, t.sort_order,
               count(o.id) as orders, coalesce(sum(o.declared_hours), 0) as hours
        from public.technicians t
        left join public.v_repair_orders_overview o on o.technician_id = t.id and o.status <> 'invoiced'
        where t.is_active and not t.exclude_from_planning
        group by t.id
      ) w)
  );
end;
$$;
