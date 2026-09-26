-- =============================================================================
-- RTS Atelier — 02. Référentiels : comptes, équipe, réglages, fichiers,
--                   clients, véhicules, fournisseurs, catalogues
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Comptes et équipe
-- ---------------------------------------------------------------------------

-- Profil applicatif, 1-1 avec auth.users. Créé par l'Edge Function
-- d'administration des comptes (jamais auto-attribué : fini le « premier
-- connecté devient Direction »).
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'Compte applicatif (rôle Direction / Réception / Technicien / Borne).';

create table public.technicians (
  id                     uuid primary key default gen_random_uuid(),
  profile_id             uuid unique references public.profiles (id) on delete set null,
  display_name           text not null check (btrim(display_name) <> ''),
  color                  text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  exclude_from_planning  boolean not null default false,
  rest_group             public.rest_group,           -- repos tournant un lundi sur deux
  is_active              boolean not null default true,
  sort_order             integer not null default 0,
  legacy_email           text,                         -- sert à vérifier les anciens PIN (hash SHA-256 par e-mail)
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.technicians is 'Technicien d''atelier (planning, OR, pointage). Lié à un compte via profile_id.';

-- Code PIN de pointage : table jamais lisible par les clients (RLS sans politique),
-- uniquement manipulée par les fonctions set_technician_pin / kiosk_clock.
create table public.technician_pins (
  technician_id  uuid primary key references public.technicians (id) on delete cascade,
  pin_hash       text not null,
  algorithm      text not null default 'bcrypt' check (algorithm in ('bcrypt', 'legacy_sha256')),
  set_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Fichiers (objets stockés dans Cloudflare R2)
-- ---------------------------------------------------------------------------
-- Les lignes sont créées par l'Edge Function d'upload (clé de service) qui
-- renvoie une URL signée ; le navigateur n'écrit jamais directement ici.
create table public.files (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null default 'rts-atelier',
  storage_key  text not null unique,
  category     public.file_category not null,
  mime_type    text not null,
  size_bytes   bigint check (size_bytes >= 0),
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz            -- marqué pour suppression ; l'objet R2 est purgé par une tâche planifiée
);
comment on table public.files is 'Métadonnées des fichiers stockés dans R2 (photos, signatures, cartes grises, PDF).';

-- ---------------------------------------------------------------------------
-- Réglages (tables à une seule ligne)
-- ---------------------------------------------------------------------------

create table public.company_settings (
  id                      boolean primary key default true check (id),
  legal_name              text not null,
  legal_form              text,
  share_capital           text,
  address_line            text not null,
  postal_code             text not null,
  city                    text not null,
  email                   text,
  phone                   text,
  siren                   text,
  siret                   text,
  vat_number              text,
  rcs                     text,
  default_vat_rate        numeric(5,2) not null default 20 check (default_vat_rate >= 0),
  payment_terms_days      integer not null default 30 check (payment_terms_days >= 0),
  quote_validity_days     integer not null default 30 check (quote_validity_days > 0),
  invoice_legal_mentions  text[] not null default '{}',
  logo_file_id            uuid references public.files (id) on delete set null,
  updated_at              timestamptz not null default now()
);
comment on table public.company_settings is 'Coordonnées légales de l''entreprise (en-têtes de devis / factures). Une seule ligne.';

insert into public.company_settings (
  legal_name, legal_form, share_capital, address_line, postal_code, city, email,
  siren, siret, vat_number, rcs, invoice_legal_mentions
) values (
  'RAPID TRUCK SERVICE', 'SASU', '181 726 €', '19 rue Gaston Monmousseau', '95190', 'Goussainville',
  'atelier@rapidtruckservice.fr', '984 989 137', '984 989 137 00018', 'FR66984989137', 'RCS Pontoise',
  array[
    'CGV : Facturation au barème de temps constructeur ou au temps passé.',
    'Rappel des CGV, pour les professionnels : en cas de retard de paiement, des pénalités de retard, calculées au taux annuel égal au dernier taux « Refi » de la BCE majoré de 10 points, appliqué au montant TTC, seront acquises de plein droit au Garage, plus une indemnité forfaitaire de 40 € par facture.',
    'Pas d''escompte pour paiement anticipé.',
    'TVA sur les encaissements.'
  ]
);

create table public.labor_rates (
  category          public.labor_category primary key,
  label             text not null,
  labor_line_label  text not null,     -- libellé de la ligne de main d'œuvre sur devis / facture
  hourly_rate       numeric(10,2) not null check (hourly_rate >= 0),
  updated_at        timestamptz not null default now()
);
comment on table public.labor_rates is 'Taux horaires HT par catégorie (PL, VUL, remorque, tôlerie).';

insert into public.labor_rates (category, label, labor_line_label, hourly_rate) values
  ('pl',       'PL',                  'Main d''œuvre mécanique poids lourds niveau 1', 90),
  ('vul',      'VUL',                 'Main d''œuvre mécanique VUL niveau 1',          75),
  ('remorque', 'Remorque',            'Main d''œuvre mécanique remorque niveau 1',     90),
  ('tolerie',  'Tôlerie/Carrosserie', 'Main d''œuvre tôlerie niveau 1',                80);

create table public.app_settings (
  id                            boolean primary key default true check (id),
  -- Dépannage / intervention extérieure
  roadside_flat_fee             numeric(10,2) not null default 60,
  roadside_price_per_km         numeric(10,2) not null default 1.50,
  roadside_travel_hourly_rate   numeric(10,2) not null default 90,
  -- Horaires atelier (planning, occupation, relevé d'heures)
  workday_start                 time not null default '09:00',
  workday_end                   time not null default '18:00',
  lunch_start                   time not null default '13:00',
  lunch_end                     time not null default '14:00',
  friday_lunch_start            time not null default '12:30',
  daily_hours                   numeric(4,2) not null default 8,
  friday_hours                  numeric(4,2) not null default 7.5,
  overtime_start                time not null default '18:30',   -- heures sup. au-delà
  expected_arrival              time not null default '09:00',
  late_tolerance                time not null default '09:05',   -- retard si première arrivée après
  -- Repos tournant : lundi où le groupe A est en repos
  rest_reference_monday         date check (rest_reference_monday is null or extract(isodow from rest_reference_monday) = 1),
  -- Pointage
  clock_photo_retention_months  integer not null default 3 check (clock_photo_retention_months in (1, 3, 6, 12)),
  -- Lecture automatique des étiquettes par l'IA
  label_scan_enabled            boolean not null default false,
  updated_at                    timestamptz not null default now()
);
insert into public.app_settings default values;

-- Code de sortie de la borne / de l'écran atelier : jamais lisible (RLS sans politique).
create table public.kiosk_secrets (
  id              boolean primary key default true check (id),
  exit_code_hash  text,
  updated_at      timestamptz not null default now()
);
insert into public.kiosk_secrets default values;

-- ---------------------------------------------------------------------------
-- Clients, fournisseurs, véhicules
-- ---------------------------------------------------------------------------

create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (btrim(name) <> ''),
  name_key          text generated always as (public.normalize_key(name)) stored,
  email             text,
  phone             text,
  billing_address   text,
  siren             text,
  discount_percent  numeric(5,2) check (discount_percent between 0 and 100),   -- remise appliquée par défaut
  hourly_rate       numeric(10,2) check (hourly_rate >= 0),                     -- taux horaire spécifique (sinon taux standard)
  portal_token      text unique,                                                -- lien de l'espace client en ligne
  notes             text,
  legacy_key        text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index clients_name_key_key on public.clients (name_key);
comment on column public.clients.name_key is 'Nom normalisé : empêche de créer deux fois le même client (« Dupont SA » = « DUPONT-SA »).';

create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  name_key    text generated always as (public.normalize_key(name)) stored,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index suppliers_name_key_key on public.suppliers (name_key);
comment on table public.suppliers is 'Fournisseurs de pièces et prestataires de sous-traitance.';

create table public.vehicles (
  id                        uuid primary key default gen_random_uuid(),
  plate                     text not null,
  plate_key                 text generated always as (public.normalize_key(plate)) stored,
  client_id                 uuid references public.clients (id) on delete set null,
  vehicle_type              public.vehicle_type not null default 'pl',
  brand                     text,
  model                     text,
  vin                       text,
  first_registration_date   date,
  ct_due_date               date,          -- prochaine échéance contrôle technique
  tailgate_due_date         date,          -- prochaine échéance contrôle hayon
  registration_doc_file_id  uuid references public.files (id) on delete set null,   -- photo de la carte grise
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint vehicles_plate_not_empty check (public.normalize_key(plate) <> '')
);
create unique index vehicles_plate_key_key on public.vehicles (plate_key);
create index vehicles_client_id_idx on public.vehicles (client_id);

-- ---------------------------------------------------------------------------
-- Catalogues : pièces, forfaits, consommables
-- ---------------------------------------------------------------------------

create table public.parts (
  id                uuid primary key default gen_random_uuid(),
  designation       text not null check (btrim(designation) <> ''),
  brand             text,
  manufacturer_ref  text,        -- référence fabricant
  oem_ref           text,        -- référence constructeur
  supplier_id       uuid references public.suppliers (id) on delete set null,
  purchase_price    numeric(12,2) check (purchase_price >= 0),
  sale_price        numeric(12,2) check (sale_price >= 0),
  is_active         boolean not null default true,
  legacy_id         text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.parts is 'Catalogue de pièces (prix d''achat / de vente, références).';

-- Cases d'usure de la fiche de contrôle pouvant déclencher un forfait.
create or replace function public.inspection_wear_fields()
returns text[]
language sql
immutable
as $$
  select array[
    'plaquettes_avant', 'plaquettes_arriere', 'disques_avant', 'disques_arriere',
    'barre_accouplement', 'barre_direction', 'kit_accessoires'
  ];
$$;

create table public.service_packages (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  category        public.labor_category,              -- null = toutes catégories
  standard_hours  numeric(6,2) not null check (standard_hours >= 0),   -- temps barème
  price           numeric(12,2) check (price >= 0),   -- prix forfaitaire HT
  details         text,                               -- détail des opérations (une par ligne)
  keywords        text[] not null default '{}',       -- groupes de mots-clés déclencheurs
  trigger_fields  text[] not null default '{}' check (trigger_fields <@ public.inspection_wear_fields()),
  is_active       boolean not null default true,
  legacy_id       text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.service_packages is 'Forfaits (entretien standard) : détectés par mots-clés ou par les cases HS / 50 % de la fiche de contrôle.';

create table public.consumables (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (btrim(name) <> ''),
  unit             text not null default 'L',
  sale_price       numeric(12,2) not null default 0 check (sale_price >= 0),       -- prix de vente HT par unité
  purchase_price   numeric(12,2) not null default 0 check (purchase_price >= 0),   -- prix d'achat HT par unité
  stock_qty        numeric(12,2) not null default 0,                                -- tenu à jour par consumable_movements
  alert_threshold  numeric(12,2) check (alert_threshold >= 0),
  is_active        boolean not null default true,
  legacy_id        text unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.consumables is 'Consommables en vrac (huile, liquide de refroidissement, AdBlue…) avec stock.';

-- ---------------------------------------------------------------------------
-- Fonctions de rôle (utilisées par les politiques RLS)
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active;
$$;

create or replace function public.is_direction()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'direction', false);
$$;

create or replace function public.is_office()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('direction', 'reception'), false);
$$;

create or replace function public.is_kiosk()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'kiosk', false);
$$;

-- Fiche technicien du compte connecté (null si le compte n'est pas technicien).
create or replace function public.current_technician_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from public.technicians t
  join public.profiles p on p.id = t.profile_id
  where t.profile_id = auth.uid() and t.is_active and p.is_active;
$$;
