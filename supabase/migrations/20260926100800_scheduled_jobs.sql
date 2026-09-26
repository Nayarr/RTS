-- =============================================================================
-- RTS Atelier — 09. Tâches planifiées (pg_cron) : alertes et purges
-- =============================================================================
-- Remplace la logique qui tournait dans le navigateur de la direction
-- (alertes stockées dans le localStorage, purge des photos au chargement).
-- =============================================================================

-- Génère les alertes de la cloche (idempotent grâce à dedupe_key).
create or replace function public.generate_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
  v_now_time time := (now() at time zone 'Europe/Paris')::time;
  v_month text := to_char(v_today, 'YYYY-MM');
  v_count integer := 0;
  v_rows integer;
begin
  -- OR en retard : fin prévue dépassée aujourd'hui, toujours assigné / en cours
  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  select 'direction', 'late_repair_order',
         'Retard atelier : ' || v.plate,
         'Fin prévue à ' || to_char(r.planned_end, 'HH24:MI') || ' (' || coalesce(t.display_name, '—') || '), OR toujours '
           || lower(public.repair_order_status_label(r.status)),
         r.id, '/or/' || r.id, 'late-ro-' || r.id || '-' || v_today
  from public.repair_orders r
  join public.vehicles v on v.id = r.vehicle_id
  left join public.technicians t on t.id = r.technician_id
  where r.planned_date = v_today and r.planned_end < v_now_time and r.status in ('assigned', 'in_progress')
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Demandes de congé à traiter
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'leave_request',
         'Demande de congé : ' || t.display_name,
         'Du ' || to_char(l.starts_on, 'DD/MM/YYYY') || ' au ' || to_char(l.ends_on, 'DD/MM/YYYY'),
         '/equipe/conges', 'leave-' || l.id
  from public.leave_requests l join public.technicians t on t.id = l.technician_id
  where l.status = 'requested' and not l.is_deleted
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Badge pendant une absence validée
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'clock_during_leave',
         'Badge pendant une absence : ' || t.display_name,
         'Pointage le ' || to_char(c.occurred_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'),
         '/equipe/pointages', 'clock-leave-' || c.id
  from public.clock_events c join public.technicians t on t.id = c.technician_id
  where c.during_leave_type is not null and c.work_date >= v_today - 7
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Rappel client à envoyer pour les rendez-vous de demain
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'appointment_reminder',
         'Rappel à envoyer : RDV demain ' || to_char(a.start_time, 'HH24:MI'),
         coalesce(c.name, '') || coalesce(' — ' || v.plate, ''),
         '/rendez-vous', 'appt-reminder-' || a.id
  from public.appointments a
  left join public.clients c on c.id = a.client_id
  left join public.vehicles v on v.id = a.vehicle_id
  where a.status = 'planned' and a.scheduled_date = v_today + 1 and a.reminder_sent_at is null
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Sous-traitance en retard
  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  select 'direction', 'late_subcontract',
         'Sous-traitance en retard : ' || s.service,
         sp.name || ' — ' || v.plate || ', retour prévu le ' || to_char(s.expected_return_on, 'DD/MM/YYYY'),
         r.id, '/or/' || r.id, 'subcontract-' || s.id || '-' || v_today
  from public.subcontracts s
  join public.suppliers sp on sp.id = s.supplier_id
  join public.repair_orders r on r.id = s.repair_order_id
  join public.vehicles v on v.id = r.vehicle_id
  where s.status = 'sent' and s.expected_return_on < v_today
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Entretien sous contrat à planifier
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'contract_service_due',
         'Entretien à planifier : ' || s.plate,
         coalesce(c.name, '') || ' — contrat ' || coalesce(nullif(mc.service_description, ''), 'd''entretien'),
         '/contrats', 'contract-' || s.contract_id || '-' || s.vehicle_id || '-' || v_month
  from public.v_contract_vehicle_status s
  join public.maintenance_contracts mc on mc.id = s.contract_id
  left join public.clients c on c.id = s.client_id
  where s.service_due and not s.appointment_planned
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Stock bas de consommables
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'low_stock',
         'Stock bas : ' || k.name,
         'Reste ' || k.stock_qty || ' ' || k.unit || ' (seuil ' || k.alert_threshold || ')',
         '/stock/consommables', 'stock-' || k.id || '-' || v_today
  from public.consumables k
  where k.is_active and k.alert_threshold is not null and k.stock_qty <= k.alert_threshold
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  -- Factures en retard de paiement
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'overdue_invoice',
         'Facture en retard : ' || b.number,
         coalesce(b.client_name, '') || ' — reste dû ' || to_char(b.balance_due, 'FM999G999G990D00') || ' € TTC',
         '/factures/' || b.invoice_id, 'invoice-overdue-' || b.invoice_id
  from public.v_invoice_balances b
  where b.payment_status = 'overdue'
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count; v_count := v_count + v_rows;

  return v_count;
end;
$$;

-- Photos de pointage au-delà de la durée de conservation : marquées pour
-- suppression (l'objet R2 est effacé par l'Edge Function de purge des fichiers).
create or replace function public.purge_clock_photos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_months integer;
  v_count integer;
begin
  select clock_photo_retention_months into v_months from public.app_settings;

  with expired as (
    update public.clock_events
       set photo_purged_at = now()
     where photo_file_id is not null
       and photo_purged_at is null
       and work_date < (public.paris_date(now()) - make_interval(months => v_months))::date
    returning photo_file_id
  )
  update public.files f set deleted_at = now()
  from expired e
  where f.id = e.photo_file_id and f.deleted_at is null;
  get diagnostics v_count = row_count;

  delete from public.kiosk_failed_attempts where attempted_at < now() - interval '1 day';
  return v_count;
end;
$$;

-- Tâches internes : exécutées uniquement par pg_cron, jamais depuis l'API.
revoke execute on function public.generate_alerts(), public.purge_clock_photos()
  from public, anon, authenticated;

-- Planification (pg_cron). Heures en UTC.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rts-generate-alerts', '*/5 * * * *', 'select public.generate_alerts()');
    perform cron.schedule('rts-purge-clock-photos', '0 2 * * *', 'select public.purge_clock_photos()');
  else
    raise notice 'pg_cron indisponible : tâches planifiées non créées';
  end if;
end;
$$;
