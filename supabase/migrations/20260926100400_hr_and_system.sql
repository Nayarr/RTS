-- =============================================================================
-- RTS Atelier — 05. RH (pointage, congés) et système (alertes, notifications push)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pointage (borne tablette avec PIN + photo, ou correction manuelle)
-- ---------------------------------------------------------------------------

create table public.clock_events (
  id                 uuid primary key default gen_random_uuid(),
  technician_id      uuid not null references public.technicians (id) on delete restrict,
  event_type         public.clock_event_type not null,
  occurred_at        timestamptz not null default now(),
  work_date          date not null,                    -- jour (heure de Paris), renseigné par trigger si absent
  source             public.clock_source not null,
  photo_file_id      uuid references public.files (id) on delete set null,
  photo_purged_at    timestamptz,                      -- photo supprimée (durée de conservation dépassée)
  during_leave_type  public.leave_type,                -- a badgé pendant une absence validée
  reason             text,                             -- motif d'une correction manuelle
  entered_by         uuid references public.profiles (id) on delete set null,
  legacy_id          text unique,
  created_at         timestamptz not null default now()
);
create index clock_events_tech_date_idx on public.clock_events (technician_id, work_date, occurred_at);
create index clock_events_date_idx on public.clock_events (work_date);
comment on table public.clock_events is 'Pointages arrivée / départ des techniciens.';

create table public.leave_requests (
  id             uuid primary key default gen_random_uuid(),
  technician_id  uuid not null references public.technicians (id) on delete cascade,
  leave_type     public.leave_type not null,
  starts_on      date not null,
  ends_on        date not null,
  comment        text,
  status         public.leave_status not null default 'requested',
  decided_by     uuid references public.profiles (id) on delete set null,
  decided_at     timestamptz,
  is_deleted     boolean not null default false,
  created_by     uuid references public.profiles (id) on delete set null,
  legacy_id      text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint leave_requests_range_check check (ends_on >= starts_on)
);
create index leave_requests_tech_idx on public.leave_requests (technician_id, starts_on, ends_on);
comment on table public.leave_requests is 'Congés et absences (demandés par le technicien ou saisis par la direction).';

-- Tentatives de PIN / code de sortie erronées (limitation anti force brute).
create table public.kiosk_failed_attempts (
  id            bigint generated always as identity primary key,
  attempted_by  uuid,
  attempted_at  timestamptz not null default now()
);
create index kiosk_failed_attempts_at_idx on public.kiosk_failed_attempts (attempted_at);

-- ---------------------------------------------------------------------------
-- Alertes (cloche) et notifications push
-- ---------------------------------------------------------------------------

-- Alertes générées côté serveur (tâche planifiée), plus dans le localStorage.
create table public.notifications (
  id                    uuid primary key default gen_random_uuid(),
  recipient_role        public.app_role,                                  -- diffusion à un rôle (ex. direction)…
  recipient_profile_id  uuid references public.profiles (id) on delete cascade,   -- …ou à une personne
  type                  text not null,
  title                 text not null,
  body                  text,
  repair_order_id       uuid references public.repair_orders (id) on delete cascade,
  link                  text,                                             -- route de l'appli à ouvrir
  dedupe_key            text unique,                                      -- évite de générer deux fois la même alerte
  created_at            timestamptz not null default now(),
  constraint notifications_recipient_check check (recipient_role is not null or recipient_profile_id is not null)
);
create index notifications_created_idx on public.notifications (created_at desc);

create table public.notification_reads (
  notification_id  uuid not null references public.notifications (id) on delete cascade,
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (notification_id, profile_id)
);

-- Abonnements Web Push (standard VAPID, sans Firebase).
create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth_key      text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
