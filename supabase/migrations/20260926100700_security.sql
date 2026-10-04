-- =============================================================================
-- RTS Atelier : 08. Sécurité : Row Level Security, droits, temps réel
-- =============================================================================
-- Règle générale : RLS activé sur TOUTES les tables. Sans politique = aucun accès
-- (c'est le cas des tables de secrets : technician_pins, kiosk_secrets,
-- kiosk_failed_attempts, document_sequences).
--
-- Rôles applicatifs :
--   bureau (office)  = direction + réception
--   technicien       = compte lié à une fiche technicians (current_technician_id())
--   borne (kiosk)    = tablette de pointage / écran atelier, lecture seule
-- Les visiteurs anonymes (clients) n'accèdent à rien directement : uniquement à
-- public_get_document() et, via une Edge Function, à public_respond_quote().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Activation du RLS et retrait des droits anonymes sur les tables
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('revoke all on table public.%I from anon', r.tablename);
  end loop;
end;
$$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- Fonctions : tout est fermé, puis ouvert explicitement
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Utilitaires utilisés par les politiques, les vues, les colonnes calculées et les contraintes
grant execute on function
  public.current_app_role(),
  public.is_direction(),
  public.is_office(),
  public.is_kiosk(),
  public.current_technician_id(),
  public.normalize_key(text),
  public.line_net_ht(public.line_type, numeric, numeric, numeric),
  public.required_photo_labels(public.vehicle_type),
  public.inspection_wear_fields(),
  public.repair_order_status_label(public.repair_order_status),
  public.paris_date(timestamptz),
  public.labor_rate_for(uuid, public.vehicle_type),
  public.package_fits_vehicle(public.labor_category, public.vehicle_type),
  public.set_updated_at(),
  public.is_system_context(),
  public.is_migration_context()
to authenticated;

-- Fonctions métier appelables par l'appli (chacune vérifie elle-même les droits)
grant execute on function
  public.tech_update_repair_order(uuid, jsonb),
  public.update_vehicle_deadlines(uuid, jsonb),
  public.start_timer(uuid),
  public.stop_timer(uuid),
  public.complete_repair_order(uuid, boolean),
  public.apply_package_keywords(uuid),
  public.build_quote_from_repair_order(uuid),
  public.assign_quote_number(uuid, boolean),
  public.share_quote(uuid),
  public.create_repair_order_from_quote(uuid, uuid),
  public.merge_quote_into_repair_order(uuid, uuid),
  public.create_repair_order_from_appointment(uuid),
  public.build_invoice_draft(uuid[]),
  public.issue_invoice(uuid),
  public.share_invoice(uuid),
  public.share_client_portal(uuid),
  public.set_technician_pin(uuid, text),
  public.kiosk_clock(text, uuid),
  public.set_kiosk_exit_code(text),
  public.verify_kiosk_exit_code(text)
to authenticated;

-- Pages publiques (lien envoyé au client)
grant execute on function public.public_get_document(text) to anon, authenticated;
-- Réponse à un devis : uniquement via l'Edge Function (clé de service)
grant execute on function public.public_respond_quote(text, boolean, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Comptes et équipe
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_office());
create policy profiles_write on public.profiles for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy technicians_select on public.technicians for select to authenticated
  using (public.current_app_role() is not null);
create policy technicians_write on public.technicians for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

-- ---------------------------------------------------------------------------
-- Réglages : lisibles par tous les comptes actifs, modifiables par la direction
-- ---------------------------------------------------------------------------

create policy company_settings_select on public.company_settings for select to authenticated
  using (public.current_app_role() is not null);
create policy company_settings_update on public.company_settings for update to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy labor_rates_select on public.labor_rates for select to authenticated
  using (public.current_app_role() is not null);
create policy labor_rates_update on public.labor_rates for update to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy app_settings_select on public.app_settings for select to authenticated
  using (public.current_app_role() is not null);
create policy app_settings_update on public.app_settings for update to authenticated
  using (public.is_direction()) with check (public.is_direction());

-- ---------------------------------------------------------------------------
-- Fichiers : lecture des métadonnées ; écriture uniquement par l'Edge Function
-- ---------------------------------------------------------------------------

create policy files_select on public.files for select to authenticated
  using (
    public.is_office()
    or uploaded_by = auth.uid()
    or exists (
      select 1 from public.ro_photos p join public.repair_orders r on r.id = p.repair_order_id
      where p.file_id = files.id and r.technician_id = public.current_technician_id())
    or exists (
      select 1 from public.repair_orders r
      where r.customer_signature_file_id = files.id and r.technician_id = public.current_technician_id())
  );

-- ---------------------------------------------------------------------------
-- Clients, fournisseurs, véhicules, catalogues
-- ---------------------------------------------------------------------------

create policy clients_select on public.clients for select to authenticated
  using (
    public.is_office()
    or exists (select 1 from public.repair_orders r
               where r.client_id = clients.id and r.technician_id = public.current_technician_id())
    or (public.is_kiosk() and exists (select 1 from public.appointments a where a.client_id = clients.id))
  );
create policy clients_insert on public.clients for insert to authenticated with check (public.is_office());
create policy clients_update on public.clients for update to authenticated using (public.is_office()) with check (public.is_office());
create policy clients_delete on public.clients for delete to authenticated using (public.is_direction());

create policy suppliers_select on public.suppliers for select to authenticated using (public.is_office());
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy vehicles_select on public.vehicles for select to authenticated
  using (
    public.is_office() or public.is_kiosk()
    or exists (select 1 from public.repair_orders r
               where r.vehicle_id = vehicles.id and r.technician_id = public.current_technician_id())
  );
create policy vehicles_insert on public.vehicles for insert to authenticated with check (public.is_office());
create policy vehicles_update on public.vehicles for update to authenticated using (public.is_office()) with check (public.is_office());
create policy vehicles_delete on public.vehicles for delete to authenticated using (public.is_direction());

create policy parts_select on public.parts for select to authenticated using (public.is_office());
create policy parts_write on public.parts for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy service_packages_select on public.service_packages for select to authenticated
  using (public.current_app_role() is not null);
create policy service_packages_write on public.service_packages for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy consumables_select on public.consumables for select to authenticated using (public.is_office());
create policy consumables_write on public.consumables for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy consumable_movements_select on public.consumable_movements for select to authenticated using (public.is_office());
-- Réapprovisionnement / ajustement manuel ; les sorties « usage » sont créées par trigger.
create policy consumable_movements_insert on public.consumable_movements for insert to authenticated
  with check (public.is_direction() and reason in ('restock', 'adjustment'));

-- ---------------------------------------------------------------------------
-- Atelier
-- ---------------------------------------------------------------------------

-- Le technicien lit ses OR ; il ne les modifie que via les fonctions dédiées
-- (tech_update_repair_order, start_timer, complete_repair_order…).
create policy repair_orders_select on public.repair_orders for select to authenticated
  using (public.is_office() or public.is_kiosk() or technician_id = public.current_technician_id());
create policy repair_orders_insert on public.repair_orders for insert to authenticated with check (public.is_office());
create policy repair_orders_update on public.repair_orders for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy repair_orders_delete on public.repair_orders for delete to authenticated using (public.is_direction());

-- Condition réutilisée : technicien assigné sur un OR encore ouvert.
create or replace function public.can_tech_edit_repair_order(p_repair_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.repair_orders r
    where r.id = p_repair_order_id
      and r.technician_id = public.current_technician_id()
      and r.status in ('assigned', 'in_progress'));
$$;

create or replace function public.can_read_repair_order(p_repair_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_office() or public.is_kiosk() or exists (
    select 1 from public.repair_orders r
    where r.id = p_repair_order_id and r.technician_id = public.current_technician_id());
$$;

-- Supabase accorde par défaut l'exécution des nouvelles fonctions à anon :
-- chaque fonction créée après le verrouillage global est donc révoquée explicitement.
revoke execute on function public.can_tech_edit_repair_order(uuid), public.can_read_repair_order(uuid)
  from public, anon;
grant execute on function public.can_tech_edit_repair_order(uuid), public.can_read_repair_order(uuid) to authenticated;

create policy inspections_select on public.inspections for select to authenticated
  using (public.can_read_repair_order(repair_order_id));
create policy inspections_insert on public.inspections for insert to authenticated
  with check (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));
create policy inspections_update on public.inspections for update to authenticated
  using (public.is_office() or public.can_tech_edit_repair_order(repair_order_id))
  with check (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));

create policy ro_lines_select on public.ro_lines for select to authenticated
  using (public.can_read_repair_order(repair_order_id));
create policy ro_lines_insert on public.ro_lines for insert to authenticated
  with check (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));
create policy ro_lines_update on public.ro_lines for update to authenticated
  using (public.is_office() or public.can_tech_edit_repair_order(repair_order_id))
  with check (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));
create policy ro_lines_delete on public.ro_lines for delete to authenticated
  using (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));

create policy time_entries_select on public.time_entries for select to authenticated
  using (public.can_read_repair_order(repair_order_id));
-- Corrections manuelles de chrono par la direction ; sinon start_timer / stop_timer.
create policy time_entries_direction on public.time_entries for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

create policy ro_photos_select on public.ro_photos for select to authenticated
  using (public.can_read_repair_order(repair_order_id));
create policy ro_photos_insert on public.ro_photos for insert to authenticated
  with check (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));
create policy ro_photos_delete on public.ro_photos for delete to authenticated
  using (public.is_office() or public.can_tech_edit_repair_order(repair_order_id));

create policy ro_events_select on public.ro_events for select to authenticated using (public.is_office());
create policy ro_events_insert on public.ro_events for insert to authenticated with check (public.is_office());

create policy subcontracts_office on public.subcontracts for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy ro_consumables_office on public.ro_consumables for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy repair_order_seen_own on public.repair_order_seen for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Commercial (bureau). Les gardes d'immuabilité des factures sont des triggers.
-- ---------------------------------------------------------------------------

create policy quotes_office on public.quotes for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy quote_lines_office on public.quote_lines for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy invoices_office on public.invoices for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy invoice_lines_office on public.invoice_lines for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy invoice_repair_orders_office on public.invoice_repair_orders for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy credit_notes_select on public.credit_notes for select to authenticated using (public.is_office());
create policy credit_notes_insert on public.credit_notes for insert to authenticated with check (public.is_office());

create policy payments_select on public.payments for select to authenticated using (public.is_office());
create policy payments_insert on public.payments for insert to authenticated with check (public.is_office());
create policy payments_delete on public.payments for delete to authenticated using (public.is_direction());

create policy invoice_reminders_office on public.invoice_reminders for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy appointments_select on public.appointments for select to authenticated
  using (public.is_office() or public.is_kiosk());
create policy appointments_write on public.appointments for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy maintenance_contracts_office on public.maintenance_contracts for all to authenticated
  using (public.is_office()) with check (public.is_office());
create policy maintenance_contract_vehicles_office on public.maintenance_contract_vehicles for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy warranty_claims_office on public.warranty_claims for all to authenticated
  using (public.is_office()) with check (public.is_office());

create policy client_messages_office on public.client_messages for all to authenticated
  using (public.is_office()) with check (public.is_office());

-- ---------------------------------------------------------------------------
-- RH
-- ---------------------------------------------------------------------------

-- Pointages : la direction voit tout, le technicien les siens. Écriture borne via kiosk_clock().
create policy clock_events_select on public.clock_events for select to authenticated
  using (public.is_direction() or technician_id = public.current_technician_id());
create policy clock_events_direction on public.clock_events for all to authenticated
  using (public.is_direction()) with check (public.is_direction());

-- Congés : le bureau les voit (planning), le technicien voit et demande les siens.
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (public.is_office() or public.is_kiosk() or technician_id = public.current_technician_id());
create policy leave_requests_request on public.leave_requests for insert to authenticated
  with check (
    public.is_direction()
    or (technician_id = public.current_technician_id() and status = 'requested' and decided_by is null)
  );
create policy leave_requests_direction_update on public.leave_requests for update to authenticated
  using (public.is_direction()) with check (public.is_direction());
create policy leave_requests_direction_delete on public.leave_requests for delete to authenticated
  using (public.is_direction());

-- ---------------------------------------------------------------------------
-- Alertes et notifications push
-- ---------------------------------------------------------------------------

create policy notifications_select on public.notifications for select to authenticated
  using (recipient_profile_id = auth.uid() or recipient_role = public.current_app_role());

create policy notification_reads_own on public.notification_reads for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Vues : lecture pour les comptes connectés (les RLS des tables s'appliquent)
-- ---------------------------------------------------------------------------

grant select on
  public.v_repair_order_time,
  public.v_repair_orders_overview,
  public.v_quote_totals,
  public.v_invoice_totals,
  public.v_invoice_balances,
  public.v_invoice_line_economics,
  public.v_monthly_revenue,
  public.v_vehicle_deadlines,
  public.v_contract_vehicle_status,
  public.v_daily_attendance
to authenticated;

-- ---------------------------------------------------------------------------
-- Temps réel (Supabase Realtime) : tables écoutées par l'appli
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.repair_orders,
      public.ro_lines,
      public.ro_photos,
      public.inspections,
      public.time_entries,
      public.quotes,
      public.appointments,
      public.technicians,
      public.notifications;
  end if;
end;
$$;
