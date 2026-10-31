-- =============================================================================
-- Agenda personnel : chaque compte du bureau a son calendrier
--
-- Demande du client : un planning comme Outlook, sous « Agent Direction » et « Mails reçus »,
-- personnel au compte : chacun pose ses rendez-vous pour gérer son temps. Personne d'autre ne
-- les voit (direction comprise).
-- =============================================================================

create table public.personal_events (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  -- Journée entière : de minuit (heure de Paris) au lendemain minuit du dernier jour
  all_day     boolean not null default false,
  location    text check (char_length(location) <= 200),
  notes       text check (char_length(notes) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint personal_events_period check (ends_at > starts_at),
  -- Un rendez-vous dure au plus quelques semaines (garde-fou contre une date mal saisie)
  constraint personal_events_length check (ends_at - starts_at <= interval '62 days')
);
comment on table public.personal_events is
  'Agenda personnel : rendez-vous posés par chaque compte du bureau, visibles par lui seul.';

create index personal_events_profile_period_idx on public.personal_events (profile_id, starts_at, ends_at);

create trigger set_updated_at before update on public.personal_events
  for each row execute function public.set_updated_at();

alter table public.personal_events enable row level security;

-- Le sien seulement ; un compte du bureau (direction, réception)
create policy personal_events_select on public.personal_events for select to authenticated
  using (profile_id = (select auth.uid()));
create policy personal_events_insert on public.personal_events for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.is_office());
create policy personal_events_update on public.personal_events for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
create policy personal_events_delete on public.personal_events for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.personal_events from anon;
grant select, insert, update, delete on public.personal_events to authenticated;
