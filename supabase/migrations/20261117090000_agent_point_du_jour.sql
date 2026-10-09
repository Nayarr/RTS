-- =============================================================================
-- RTS Atelier : point du jour de l'Agent Direction
--
-- À l'ouverture de l'onglet Agent Direction, l'Edge Function « agent » lit la situation de
-- l'atelier (OR du jour, rendez-vous, retards de paiement, pièces à commander, contrôles,
-- locations, chiffres du mois, alertes) et en fait un résumé court, gardé pour la journée :
-- un seul appel à Claude par jour et par personne, plus les actualisations demandées.
--
-- Lu par son auteur (direction), écrit uniquement par l'Edge Function. Effacé après 90 jours
-- avec les conversations.
-- =============================================================================

create table public.agent_briefings (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  day                 date not null,
  text                text not null check (char_length(text) between 1 and 3000),
  tools               text[] not null default '{}',
  -- Point fait puis actualisé dans la journée (limite d'actualisations dans l'Edge Function)
  generations         smallint not null default 1 check (generations between 1 and 20),
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (profile_id, day)
);
comment on table public.agent_briefings is
  'Point du jour de l''Agent Direction, un par personne et par jour (jetons comptés pour suivre le coût).';

alter table public.agent_briefings enable row level security;
revoke all on public.agent_briefings from public, anon, authenticated;
grant select on public.agent_briefings to authenticated;

create policy agent_briefings_select on public.agent_briefings for select to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_direction()));

-- Purge de nuit : conversations sans échange depuis 90 jours et points du jour de plus de 90 jours
create or replace function public.purge_agent_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.agent_conversations where updated_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  delete from public.agent_briefings where day < current_date - 90;
  return v_count;
end;
$$;

revoke execute on function public.purge_agent_conversations() from public, anon, authenticated;
