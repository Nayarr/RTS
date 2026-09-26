-- =============================================================================
-- RTS Atelier — 03. Atelier : ordres de réparation (OR) et tout ce qui s'y rattache
-- =============================================================================

create table public.repair_orders (
  id                        uuid primary key default gen_random_uuid(),
  number                    text not null unique,     -- OR00001, attribué automatiquement à la création
  status                    public.repair_order_status not null default 'assigned',
  vehicle_id                uuid not null references public.vehicles (id) on delete restrict,
  client_id                 uuid references public.clients (id) on delete restrict,
  vehicle_type              public.vehicle_type not null,   -- figé à la création (par défaut celui du véhicule)
  mileage                   integer check (mileage >= 0),
  requested_work            text not null default '',       -- « tâche à faire »
  technician_id             uuid references public.technicians (id) on delete set null,
  planned_date              date,
  planned_start             time,
  planned_end               time,
  customer_signature_file_id uuid references public.files (id) on delete set null,   -- accord du client avant intervention
  intervention_type         public.intervention_type not null default 'workshop',
  roadside_address          text,
  roadside_km               numeric(8,1) check (roadside_km >= 0),
  roadside_travel_hours     numeric(6,2) check (roadside_travel_hours >= 0),
  origin_repair_order_id    uuid references public.repair_orders (id) on delete set null,  -- OR d'origine (devis accepté)
  origin_quote_id           uuid,             -- FK ajoutée avec la table quotes
  appointment_id            uuid,             -- FK ajoutée avec la table appointments
  maintenance_contract_id   uuid,             -- FK ajoutée avec la table maintenance_contracts
  assignment_changed_at     timestamptz not null default now(),   -- alimente les badges « Nouveau / Modifié » du technicien
  completed_at              timestamptz,
  created_by                uuid references public.profiles (id) on delete set null,
  legacy_id                 text unique,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint repair_orders_planning_check
    check (planned_end is null or planned_start is null or planned_end > planned_start)
);
create index repair_orders_status_idx on public.repair_orders (status);
create index repair_orders_vehicle_id_idx on public.repair_orders (vehicle_id);
create index repair_orders_client_id_idx on public.repair_orders (client_id);
create index repair_orders_technician_idx on public.repair_orders (technician_id, status);
create index repair_orders_planned_date_idx on public.repair_orders (planned_date);
comment on table public.repair_orders is 'Ordre de réparation (OR).';

-- Fiche de contrôle véhicule : un bloc JSON validé côté application (schéma Zod).
-- Structure : { usure: {plaquettes_avant: "OK"|"50"|"HS", …}, pneus: {avant_taille, avant_etat, …},
--               controles: {etiquettes, hayon, extincteur1, extincteur2, extincteur6, eclairage: "OK"|"HS"},
--               probleme_electrique: "OUI"|"NON", voyants: {moteur, echappement, abs, freins: bool},
--               voyants_autres: text, niveaux: {laveglace|refroidissement|huile: {etat: "bon"|"manque", litres}} }
create table public.inspections (
  repair_order_id  uuid primary key references public.repair_orders (id) on delete cascade,
  data             jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_by       uuid references public.profiles (id) on delete set null,
  updated_at       timestamptz not null default now()
);
comment on table public.inspections is 'Fiche de contrôle véhicule d''un OR (usure, pneus, contrôles, voyants, niveaux).';

-- Lignes d'OR : travaux effectués (kind = done) et travaux / pièces à prévoir (kind = planned).
create table public.ro_lines (
  id                    uuid primary key default gen_random_uuid(),
  repair_order_id       uuid not null references public.repair_orders (id) on delete cascade,
  kind                  public.ro_line_kind not null,
  position              integer not null default 0,
  line_type             public.line_type not null default 'labor'
                          check (line_type in ('labor', 'package', 'part', 'text')),
  description           text not null default '',
  estimated_hours       numeric(5,2) check (estimated_hours >= 0),   -- estimation du technicien
  estimate_is_minimum   boolean not null default false,              -- option « 12h+ »
  standard_hours        numeric(6,2) check (standard_hours >= 0),    -- temps barème (forfait)
  billed_hours          numeric(6,2) check (billed_hours >= 0),      -- temps retenu pour la facturation
  labor_category        public.labor_category,
  unit_price            numeric(12,2) check (unit_price >= 0),
  quantity              numeric(10,2) not null default 1 check (quantity > 0),
  discount_percent      numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  package_id            uuid references public.service_packages (id) on delete set null,
  part_id               uuid references public.parts (id) on delete set null,
  supplier_id           uuid references public.suppliers (id) on delete set null,
  purchase_price        numeric(12,2) check (purchase_price >= 0),
  shipping_cost         numeric(12,2) check (shipping_cost >= 0),
  brand                 text,
  manufacturer_ref      text,
  oem_ref               text,
  order_status          public.part_order_status,          -- suivi de commande, pièces uniquement
  source_quote_line_id  uuid,                              -- FK ajoutée avec quote_lines
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint ro_lines_order_status_parts_only check (order_status is null or line_type = 'part')
);
create index ro_lines_ro_idx on public.ro_lines (repair_order_id, kind, position);
create index ro_lines_parts_to_receive_idx on public.ro_lines (order_status) where line_type = 'part' and order_status <> 'received';

-- Sessions de badgeage (chrono). Une seule session ouverte par OR.
create table public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  technician_id    uuid references public.technicians (id) on delete set null,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  stopped_by       uuid references public.profiles (id) on delete set null,   -- renseigné si la direction force l'arrêt
  created_at       timestamptz not null default now(),
  constraint time_entries_range_check check (ended_at is null or ended_at >= started_at)
);
create unique index time_entries_one_running_per_ro on public.time_entries (repair_order_id) where ended_at is null;
create index time_entries_ro_idx on public.time_entries (repair_order_id);
create index time_entries_technician_idx on public.time_entries (technician_id, started_at);
comment on table public.time_entries is 'Sessions de badgeage sur un OR (remplace badge_start / temps_total_s).';

create table public.ro_photos (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  file_id          uuid not null references public.files (id) on delete restrict,
  label            text not null,       -- « Face avant », « Côté gauche », « Pièces », « Rapport diagnostique valise »…
  taken_at         timestamptz not null default now(),
  created_by       uuid references public.profiles (id) on delete set null
);
create index ro_photos_ro_idx on public.ro_photos (repair_order_id);

-- Photos obligatoires avant de démarrer le badgeage (pas de tableau de bord sur une remorque).
create or replace function public.required_photo_labels(p_vehicle_type public.vehicle_type)
returns text[]
language sql
immutable
as $$
  select case
    when p_vehicle_type = 'remorque' then array['Face avant', 'Côté gauche', 'Côté droit', 'Arrière']
    else array['Face avant', 'Côté gauche', 'Côté droit', 'Arrière', 'Tableau de bord']
  end;
$$;

-- Historique de l'OR (journal lisible par le bureau).
create table public.ro_events (
  id               uuid primary key default gen_random_uuid(),
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  label            text not null,
  actor_id         uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index ro_events_ro_idx on public.ro_events (repair_order_id, created_at);

-- Sous-traitance : travail confié à un prestataire et refacturé avec marge.
create table public.subcontracts (
  id                 uuid primary key default gen_random_uuid(),
  repair_order_id    uuid not null references public.repair_orders (id) on delete cascade,
  service            text not null check (btrim(service) <> ''),
  supplier_id        uuid not null references public.suppliers (id) on delete restrict,
  cost_ht            numeric(12,2) not null default 0 check (cost_ht >= 0),
  margin_percent     numeric(6,2) not null default 20 check (margin_percent >= 0),
  resale_price_ht    numeric(12,2) generated always as (round(cost_ht * (1 + margin_percent / 100), 2)) stored,
  sent_on            date not null default current_date,
  expected_return_on date,
  status             public.subcontract_status not null default 'sent',
  returned_on        date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index subcontracts_ro_idx on public.subcontracts (repair_order_id);

-- Consommables utilisés sur un OR (le stock est décrémenté automatiquement).
create table public.ro_consumables (
  id                   uuid primary key default gen_random_uuid(),
  repair_order_id      uuid not null references public.repair_orders (id) on delete cascade,
  consumable_id        uuid not null references public.consumables (id) on delete restrict,
  quantity             numeric(10,2) not null check (quantity > 0),
  unit                 text not null,
  unit_sale_price      numeric(12,2) not null check (unit_sale_price >= 0),      -- prix figé au moment de l'ajout
  unit_purchase_price  numeric(12,2) not null check (unit_purchase_price >= 0),
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now()
);
create index ro_consumables_ro_idx on public.ro_consumables (repair_order_id);

-- Journal des mouvements de stock des consommables (source de vérité du stock).
create table public.consumable_movements (
  id                 uuid primary key default gen_random_uuid(),
  consumable_id      uuid not null references public.consumables (id) on delete cascade,
  quantity           numeric(12,2) not null check (quantity <> 0),   -- négatif = sortie, positif = entrée
  reason             public.consumable_movement_reason not null,
  repair_order_id    uuid references public.repair_orders (id) on delete set null,
  ro_consumable_id   uuid references public.ro_consumables (id) on delete set null,
  note               text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now()
);
create index consumable_movements_consumable_idx on public.consumable_movements (consumable_id, created_at);

-- Dernière consultation d'un OR par un utilisateur (badges « Nouveau » / « Modifié »).
create table public.repair_order_seen (
  repair_order_id  uuid not null references public.repair_orders (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  seen_at          timestamptz not null default now(),
  primary key (repair_order_id, profile_id)
);
