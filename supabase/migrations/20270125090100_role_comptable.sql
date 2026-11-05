-- =============================================================================
-- Rôle « Comptable » (comptabilité + RH)
--   - devis et factures : lecture et écriture ;
--   - paiements, avoirs, relances, statistiques financières, pointages, congés,
--     relevé d'heures : lecture seule ;
--   - badge à la borne : fiche technicien obligatoire, jamais au planning.
-- Le reste de l'atelier lui est lisible seulement quand une facture ou un devis en a besoin.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fonctions de rôle
-- ---------------------------------------------------------------------------
create function public.is_accountant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'accountant', false);
$$;

-- Devis et factures : bureau et comptable.
create function public.can_bill()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('direction', 'reception', 'accountant'), false);
$$;

-- Statistiques financières et RH en lecture : direction et comptable.
create function public.can_read_accounting()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('direction', 'accountant'), false);
$$;

create function public.assert_billing()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_bill() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;
end;
$$;

create function public.assert_accounting_read()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_read_accounting() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.is_accountant(), public.can_bill(), public.can_read_accounting(),
  public.assert_billing(), public.assert_accounting_read() from public, anon;
grant execute on function public.is_accountant(), public.can_bill(), public.can_read_accounting(),
  public.assert_billing(), public.assert_accounting_read() to authenticated;

-- ---------------------------------------------------------------------------
-- Fonctions métier : seule la vérification du rôle change, le reste est repris tel quel.
-- Une vérification introuvable fait échouer la migration.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  f record;
  v_def text;
  v_new text;
  v_found boolean;
begin
  for r in
    select * from (values
      -- Devis
      ('assign_quote_number', 'public.assert_office()', 'public.assert_billing()'),
      ('build_quote_from_repair_order', 'public.assert_office()', 'public.assert_billing()'),
      ('cancel_signature_request', 'public.assert_office()', 'public.assert_billing()'),
      ('create_quote', 'public.assert_office()', 'public.assert_billing()'),
      ('duplicate_quote', 'public.assert_office()', 'public.assert_billing()'),
      ('kiosk_status', 'public.assert_office()', 'public.assert_billing()'),
      ('quote_signature_request', 'public.assert_office()', 'public.assert_billing()'),
      ('request_quote_signature', 'public.assert_office()', 'public.assert_billing()'),
      ('set_quote_response', 'public.assert_office()', 'public.assert_billing()'),
      ('share_quote', 'public.assert_office()', 'public.assert_billing()'),
      -- Factures
      ('apply_package_keywords', 'public.assert_office()', 'public.assert_billing()'),
      ('build_contract_invoice_draft', 'public.assert_office()', 'public.assert_billing()'),
      ('build_invoice_draft', 'public.assert_office()', 'public.assert_billing()'),
      ('duplicate_invoice', 'public.assert_office()', 'public.assert_billing()'),
      ('issue_invoice', 'public.assert_office()', 'public.assert_billing()'),
      ('set_invoice_due_date', 'public.assert_office()', 'public.assert_billing()'),
      ('set_invoice_vat_exempt', 'public.assert_office()', 'public.assert_billing()'),
      ('settle_pre_quote_work', 'public.assert_office()', 'public.assert_billing()'),
      ('share_invoice', 'public.assert_office()', 'public.assert_billing()'),
      -- Lectures et aides de saisie des lignes
      ('labor_rate_for', 'not public.is_office()', 'not public.can_bill()'),
      ('ensure_supplier', 'not public.is_office()', 'not public.can_bill()'),
      ('can_read_repair_order', 'select public.is_office() or', 'select public.can_bill() or'),
      ('can_upload_file', 'when ''document_pdf''     then public.is_office()', 'when ''document_pdf''     then public.can_bill()'),
      -- Statistiques financières et RH en lecture
      ('monthly_statistics', 'not public.is_direction()', 'not public.can_read_accounting()'),
      ('monthly_report', 'not public.is_direction()', 'not public.can_read_accounting()'),
      ('profitability_report', 'not public.is_direction()', 'not public.can_read_accounting()'),
      ('treasury_overview', 'not public.is_direction()', 'not public.can_read_accounting()'),
      ('technician_pin_status', 'public.assert_direction()', 'public.assert_accounting_read()')
    ) as t(fn, old_text, new_text)
  loop
    v_found := false;
    for f in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = r.fn
    loop
      v_def := pg_get_functiondef(f.oid);
      v_new := replace(v_def, r.old_text, r.new_text);
      if v_new <> v_def then
        v_found := true;
        execute v_new;
      end if;
    end loop;
    if not v_found then
      raise exception 'Rôle comptable : % introuvable dans %', r.old_text, r.fn;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Devis et factures : lecture et écriture
-- ---------------------------------------------------------------------------
alter policy quotes_office on public.quotes using (public.can_bill()) with check (public.can_bill());
alter policy quote_lines_office on public.quote_lines using (public.can_bill()) with check (public.can_bill());
alter policy invoices_office on public.invoices using (public.can_bill()) with check (public.can_bill());
alter policy invoice_lines_office on public.invoice_lines using (public.can_bill()) with check (public.can_bill());
alter policy invoice_repair_orders_office on public.invoice_repair_orders
  using (public.can_bill()) with check (public.can_bill());
alter policy invoice_due_date_changes_select on public.invoice_due_date_changes using ((select public.can_bill()));
alter policy client_messages_office on public.client_messages
  using (public.can_bill()) with check (public.can_bill());

-- Client créé pour un devis, coordonnées de facturation complétées sur une facture
alter policy clients_insert on public.clients with check (public.can_bill());
alter policy clients_update on public.clients using (public.can_bill()) with check (public.can_bill());

-- ---------------------------------------------------------------------------
-- Tout le reste : lecture seule
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    -- Ce que lisent les devis, les factures et leurs écrans
    'clients', 'vehicles', 'repair_orders', 'ro_events', 'parts', 'suppliers', 'consumables',
    'signature_requests', 'email_deliveries', 'profiles',
    'rentals', 'fleet_vehicles', 'fleet_vehicle_sales', 'maintenance_contracts', 'maintenance_contract_vehicles',
    'tires', 'tire_brands', 'tire_lines',
    -- Paiements, avoirs et relances
    'payments', 'payment_events', 'credit_notes', 'invoice_reminders',
    -- Pointages et congés
    'clock_events', 'leave_requests'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_accountant())',
      v_table || '_accountant_read', v_table);
  end loop;
end;
$$;

-- Logo et signature sur les PDF, documents envoyés ; pas les photos de badgeage ni celles des OR.
create policy files_accountant_read on public.files for select to authenticated
  using (public.is_accountant() and category in ('logo', 'signature', 'document_pdf'));

-- ---------------------------------------------------------------------------
-- Badgeage : fiche technicien obligatoire, jamais au planning ni dans la charge de l'atelier
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_register_account';

  v_new := replace(
    v_def,
    'insert into public.profiles (id, email, full_name, role)',
    'if p_role = ''accountant'' and p_technician is null then' || chr(10)
      || '    raise exception ''Un compte comptable doit avoir une fiche technicien pour badger'' using errcode = ''22023'';' || chr(10)
      || '  end if;' || chr(10) || chr(10)
      || '  insert into public.profiles (id, email, full_name, role)');
  if v_new = v_def then
    raise exception 'admin_register_account : insertion du profil introuvable';
  end if;
  execute v_new;
end;
$$;

create function public.technicians_accountant_off_planning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.profile_id and p.role = 'accountant') then
    new.exclude_from_planning := true;
  end if;
  return new;
end;
$$;

revoke execute on function public.technicians_accountant_off_planning() from public, anon, authenticated;

create trigger technicians_accountant_off_planning
  before insert or update of profile_id, exclude_from_planning on public.technicians
  for each row execute function public.technicians_accountant_off_planning();

create function public.profiles_accountant_off_planning()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.technicians set exclude_from_planning = true where profile_id = new.id;
  return null;
end;
$$;

revoke execute on function public.profiles_accountant_off_planning() from public, anon, authenticated;

create trigger profiles_accountant_off_planning
  after insert or update of role on public.profiles
  for each row when (new.role = 'accountant')
  execute function public.profiles_accountant_off_planning();
