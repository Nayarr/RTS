-- =============================================================================
-- RTS Atelier : 04. Commercial : numérotation, devis, factures, avoirs,
--                   paiements, rendez-vous, contrats, garanties, messages client
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Numérotation des documents
-- ---------------------------------------------------------------------------
-- Le numéro est attribué DANS la même transaction que la création du document :
-- si la création échoue, le numéro n'est pas consommé (aucun trou possible).
create table public.document_sequences (
  key         text primary key check (key in ('repair_order', 'quote', 'invoice', 'credit_note')),
  prefix      text not null,
  pad_length  integer not null default 0 check (pad_length >= 0),
  last_value  bigint not null default 0 check (last_value >= 0)
);
comment on table public.document_sequences is 'Compteurs de numérotation (OR, devis, factures, avoirs).';

insert into public.document_sequences (key, prefix, pad_length, last_value) values
  ('repair_order', 'OR', 5, 0),
  ('quote',        'DV', 5, 0),
  ('invoice',      'F',  0, 11886),   -- dernier numéro GTA PRO au 22/09/2026 : la suite continue à F11887
  ('credit_note',  'AV', 0, 0);

create or replace function public.next_document_number(p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq public.document_sequences;
begin
  update public.document_sequences
     set last_value = last_value + 1
   where key = p_key
  returning * into v_seq;

  if not found then
    raise exception 'Séquence de numérotation inconnue : %', p_key;
  end if;

  return v_seq.prefix || case
    when v_seq.pad_length > 0 then lpad(v_seq.last_value::text, v_seq.pad_length, '0')
    else v_seq.last_value::text
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Contrats d'entretien et rendez-vous (référencés par les OR)
-- ---------------------------------------------------------------------------

create table public.maintenance_contracts (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients (id) on delete restrict,
  service_description  text not null default '',
  frequency_months     integer check (frequency_months > 0),
  frequency_km         integer check (frequency_km > 0),
  monthly_price_ht     numeric(12,2) check (monthly_price_ht >= 0),
  starts_on            date not null default current_date,
  is_active            boolean not null default true,
  ended_on             date,
  legacy_id            text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint maintenance_contracts_frequency_check check (frequency_months is not null or frequency_km is not null)
);

create table public.maintenance_contract_vehicles (
  contract_id     uuid not null references public.maintenance_contracts (id) on delete cascade,
  vehicle_id      uuid not null references public.vehicles (id) on delete restrict,
  start_mileage   integer check (start_mileage >= 0),
  primary key (contract_id, vehicle_id)
);

create table public.appointments (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid references public.clients (id) on delete restrict,
  vehicle_id               uuid references public.vehicles (id) on delete restrict,
  vehicle_type             public.vehicle_type not null default 'pl',
  scheduled_date           date not null,
  start_time               time not null,
  end_time                 time,
  reason                   text,
  technician_id            uuid references public.technicians (id) on delete set null,
  status                   public.appointment_status not null default 'planned',
  repair_order_id          uuid references public.repair_orders (id) on delete set null,   -- OR créé à l'arrivée du véhicule
  maintenance_contract_id  uuid references public.maintenance_contracts (id) on delete set null,
  reminder_sent_at         timestamptz,
  created_by               uuid references public.profiles (id) on delete set null,
  legacy_id                text unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint appointments_target_check check (client_id is not null or vehicle_id is not null),
  constraint appointments_time_check check (end_time is null or end_time > start_time)
);
create index appointments_date_idx on public.appointments (scheduled_date) where status = 'planned';

alter table public.repair_orders
  add constraint repair_orders_appointment_fk
    foreign key (appointment_id) references public.appointments (id) on delete set null,
  add constraint repair_orders_contract_fk
    foreign key (maintenance_contract_id) references public.maintenance_contracts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------------

create table public.quotes (
  id                           uuid primary key default gen_random_uuid(),
  number                       text unique,        -- DV00001, attribué à la première génération / au premier envoi
  status                       public.quote_status not null default 'draft',
  repair_order_id              uuid references public.repair_orders (id) on delete set null,   -- null = devis sans OR
  client_id                    uuid references public.clients (id) on delete restrict,
  vehicle_id                   uuid references public.vehicles (id) on delete restrict,
  vehicle_type                 public.vehicle_type not null default 'pl',
  issued_at                    timestamptz,
  valid_until                  date,
  sent_at                      timestamptz,
  public_token                 text unique,        -- lien « à signer » envoyé au client
  accepted_at                  timestamptz,
  accepted_by_name             text,
  signature_file_id            uuid references public.files (id) on delete set null,
  refused_at                   timestamptz,
  response_processed_at        timestamptz,        -- réponse en ligne vue / traitée par le bureau
  resulting_repair_order_id    uuid references public.repair_orders (id) on delete set null,   -- OR créé avec les travaux acceptés
  merged_into_repair_order_id  uuid references public.repair_orders (id) on delete set null,   -- devis sans OR rattaché à un OR existant
  notes                        text,
  created_by                   uuid references public.profiles (id) on delete set null,
  legacy_id                    text unique,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create index quotes_repair_order_idx on public.quotes (repair_order_id);
create index quotes_status_idx on public.quotes (status);
create index quotes_client_idx on public.quotes (client_id);

create table public.quote_lines (
  id                   uuid primary key default gen_random_uuid(),
  quote_id             uuid not null references public.quotes (id) on delete cascade,
  section              public.quote_section not null default 'planned',
  position             integer not null default 0,
  line_type            public.line_type not null default 'labor',
  description          text not null default '',
  unit_price           numeric(12,2) check (unit_price >= 0),
  quantity             numeric(10,2) not null default 1 check (quantity > 0),
  discount_percent     numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  vat_rate             numeric(5,2) not null default 20 check (vat_rate >= 0),
  net_ht               numeric(12,2) generated always as (public.line_net_ht(line_type, unit_price, quantity, discount_percent)) stored,
  labor_category       public.labor_category,
  estimated_hours      numeric(5,2),
  standard_hours       numeric(6,2),
  billed_hours         numeric(6,2),
  package_id           uuid references public.service_packages (id) on delete set null,
  part_id              uuid references public.parts (id) on delete set null,
  supplier_id          uuid references public.suppliers (id) on delete set null,
  purchase_price       numeric(12,2) check (purchase_price >= 0),
  shipping_cost        numeric(12,2) check (shipping_cost >= 0),
  brand                text,
  manufacturer_ref     text,
  oem_ref              text,
  source_ro_line_id    uuid references public.ro_lines (id) on delete set null,
  done_line_decision   public.done_line_decision,       -- travaux déjà effectués : offerts ou facturés à part
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index quote_lines_quote_idx on public.quote_lines (quote_id, section, position);

alter table public.repair_orders
  add constraint repair_orders_origin_quote_fk
    foreign key (origin_quote_id) references public.quotes (id) on delete set null;
alter table public.ro_lines
  add constraint ro_lines_source_quote_line_fk
    foreign key (source_quote_line_id) references public.quote_lines (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Factures
-- ---------------------------------------------------------------------------
-- Brouillon modifiable, puis émission définitive (issue_invoice) : numéro,
-- instantané du client et totaux figés. Une facture émise ne peut plus être
-- modifiée ni supprimée (triggers) : toute correction passe par un avoir.

create table public.invoices (
  id                       uuid primary key default gen_random_uuid(),
  number                   text unique,             -- F11887…, attribué à l'émission
  status                   public.invoice_status not null default 'draft',
  client_id                uuid not null references public.clients (id) on delete restrict,
  -- Instantané client figé à l'émission (mentions obligatoires)
  client_name              text,
  client_address           text,
  client_siren             text,
  client_email             text,
  vehicle_label            text,                    -- « AB-123-CD » ou « Plusieurs véhicules (3) »
  mileage                  integer,
  maintenance_contract_id  uuid references public.maintenance_contracts (id) on delete set null,
  issued_at                timestamptz,
  service_date             date,                    -- date de la prestation
  due_date                 date,                    -- échéance de paiement
  total_ht                 numeric(12,2),           -- totaux figés à l'émission
  total_vat                numeric(12,2),
  total_ttc                numeric(12,2),
  public_token             text unique,             -- consultation en ligne par le client
  pdf_file_id              uuid references public.files (id) on delete set null,   -- PDF archivé à l'émission
  is_legacy_import         boolean not null default false,   -- facture reprise de l'ancienne appli (détail parfois partiel)
  created_by               uuid references public.profiles (id) on delete set null,
  issued_by                uuid references public.profiles (id) on delete set null,
  legacy_id                text unique,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint invoices_issued_fields_check check (
    status = 'draft'
    or (number is not null and issued_at is not null and due_date is not null
        and total_ht is not null and total_vat is not null and total_ttc is not null
        and client_name is not null)
  ),
  constraint invoices_draft_number_check check (status = 'issued' or number is null)
);
create index invoices_client_idx on public.invoices (client_id);
create index invoices_issued_at_idx on public.invoices (issued_at) where status = 'issued';

-- OR facturés par une facture (plusieurs OR = facture groupée).
create table public.invoice_repair_orders (
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  repair_order_id  uuid not null references public.repair_orders (id) on delete restrict,
  primary key (invoice_id, repair_order_id)
);
create index invoice_repair_orders_ro_idx on public.invoice_repair_orders (repair_order_id);

create table public.invoice_lines (
  id                        uuid primary key default gen_random_uuid(),
  invoice_id                uuid not null references public.invoices (id) on delete cascade,
  repair_order_id           uuid references public.repair_orders (id) on delete restrict,   -- OR concerné (facture groupée)
  position                  integer not null default 0,
  line_type                 public.line_type not null default 'labor',
  description               text not null default '',
  unit_price                numeric(12,2) check (unit_price >= 0),
  quantity                  numeric(10,2) not null default 1 check (quantity > 0),
  discount_percent          numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  vat_rate                  numeric(5,2) not null default 20 check (vat_rate >= 0),
  net_ht                    numeric(12,2) generated always as (public.line_net_ht(line_type, unit_price, quantity, discount_percent)) stored,
  labor_category            public.labor_category,
  standard_hours            numeric(6,2),
  billed_hours              numeric(6,2),
  package_id                uuid references public.service_packages (id) on delete set null,
  part_id                   uuid references public.parts (id) on delete set null,
  supplier_id               uuid references public.suppliers (id) on delete set null,
  purchase_price            numeric(12,2) check (purchase_price >= 0),   -- marge pièces (statistiques)
  shipping_cost             numeric(12,2) check (shipping_cost >= 0),
  brand                     text,
  manufacturer_ref          text,
  oem_ref                   text,
  source_ro_line_id         uuid references public.ro_lines (id) on delete set null,
  source_quote_line_id      uuid references public.quote_lines (id) on delete set null,
  source_subcontract_id     uuid references public.subcontracts (id) on delete set null,
  source_ro_consumable_id   uuid references public.ro_consumables (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id, position);
create index invoice_lines_ro_idx on public.invoice_lines (repair_order_id);

-- Avoirs : toujours rattachés à une facture émise, jamais modifiables.
create table public.credit_notes (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique,      -- AV1, AV2… attribué automatiquement
  invoice_id   uuid not null references public.invoices (id) on delete restrict,
  issued_at    timestamptz not null default now(),
  reason       text,
  amount_ht    numeric(12,2) not null check (amount_ht > 0),
  vat_rate     numeric(5,2) not null default 20 check (vat_rate >= 0),
  total_vat    numeric(12,2) generated always as (round(amount_ht * vat_rate / 100, 2)) stored,
  total_ttc    numeric(12,2) generated always as (amount_ht + round(amount_ht * vat_rate / 100, 2)) stored,
  pdf_file_id  uuid references public.files (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  legacy_id    text unique,
  created_at   timestamptz not null default now()
);
create index credit_notes_invoice_idx on public.credit_notes (invoice_id);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id) on delete restrict,
  amount_ttc   numeric(12,2) not null check (amount_ttc > 0),
  method       public.payment_method not null,
  paid_on      date not null default current_date,
  note         text,
  recorded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.invoice_reminders (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  sent_at     timestamptz not null default now(),
  sent_by     uuid references public.profiles (id) on delete set null
);
create index invoice_reminders_invoice_idx on public.invoice_reminders (invoice_id);

-- ---------------------------------------------------------------------------
-- Garanties / retours de pièces
-- ---------------------------------------------------------------------------

create table public.warranty_claims (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid references public.repair_orders (id) on delete set null,
  ro_line_id       uuid references public.ro_lines (id) on delete set null,
  vehicle_id       uuid references public.vehicles (id) on delete set null,
  client_id        uuid references public.clients (id) on delete set null,
  part_name        text not null check (btrim(part_name) <> ''),
  brand            text,
  supplier_id      uuid references public.suppliers (id) on delete set null,
  reference        text,
  amount_ht        numeric(12,2) check (amount_ht >= 0),
  reason           text,
  status           public.warranty_status not null default 'to_return',
  notes            text,
  created_by       uuid references public.profiles (id) on delete set null,
  legacy_id        text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index warranty_claims_status_idx on public.warranty_claims (status);

-- ---------------------------------------------------------------------------
-- Messages envoyés au client (traçabilité des e-mails / SMS)
-- ---------------------------------------------------------------------------

create table public.client_messages (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid references public.clients (id) on delete set null,
  repair_order_id      uuid references public.repair_orders (id) on delete set null,
  quote_id             uuid references public.quotes (id) on delete set null,
  invoice_id           uuid references public.invoices (id) on delete set null,
  appointment_id       uuid references public.appointments (id) on delete set null,
  message_type         public.client_message_type not null,
  channel              public.message_channel not null,
  recipient            text,
  subject              text,
  body                 text,
  provider_message_id  text,           -- identifiant Resend (suivi de délivrance)
  sent_by              uuid references public.profiles (id) on delete set null,
  sent_at              timestamptz not null default now()
);
create index client_messages_ro_idx on public.client_messages (repair_order_id);
create index client_messages_client_idx on public.client_messages (client_id);
