-- =============================================================================
-- RTS Atelier : assistant de la direction (questions à la voix ou à l'écrit)
--
-- La direction pose une question (« CA du mois ? », « qui me doit de l'argent ? ») ; l'Edge
-- Function « agent » interroge la base en lecture seule, avec les droits de la personne
-- connectée, et répond. Réglage « Assistant de la direction » activé par la direction.
--
-- Conversations et questions : lues par leur auteur (direction), écrites uniquement par
-- l'Edge Function. Effacées automatiquement après 90 jours sans échange.
-- =============================================================================

alter table public.app_settings add column agent_enabled boolean not null default false;
comment on column public.app_settings.agent_enabled is
  'Assistant de la direction activé (Edge Function agent, secret ANTHROPIC_AGENT_API_KEY).';

create table public.agent_conversations (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  -- Échanges bruts avec l'assistant, rejoués tels quels à la question suivante
  transcript  jsonb not null default '[]'::jsonb check (jsonb_typeof(transcript) = 'array'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index agent_conversations_profile_idx on public.agent_conversations (profile_id, updated_at desc);
comment on table public.agent_conversations is 'Conversations de la direction avec l''assistant (90 jours).';

create table public.agent_turns (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.agent_conversations (id) on delete cascade,
  profile_id          uuid not null references public.profiles (id) on delete cascade,
  question            text not null check (char_length(question) between 1 and 2000),
  answer              text not null,
  spoken              boolean not null default false,
  tools               text[] not null default '{}',
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cache_read_tokens   integer not null default 0,
  cache_write_tokens  integer not null default 0,
  created_at          timestamptz not null default now()
);
create index agent_turns_conversation_idx on public.agent_turns (conversation_id, created_at);
create index agent_turns_profile_idx on public.agent_turns (profile_id, created_at);
comment on table public.agent_turns is
  'Questions posées à l''assistant et réponses (jetons comptés pour suivre le coût et la limite du jour).';

alter table public.agent_conversations enable row level security;
alter table public.agent_turns enable row level security;

-- Le contenu brut des échanges reste côté serveur : la page lit le titre et les questions.
revoke all on public.agent_conversations, public.agent_turns from public, anon, authenticated;
grant select (id, profile_id, title, created_at, updated_at) on public.agent_conversations to authenticated;
grant delete on public.agent_conversations to authenticated;
grant select on public.agent_turns to authenticated;

create policy agent_conversations_select on public.agent_conversations for select to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_direction()));
create policy agent_conversations_delete on public.agent_conversations for delete to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_direction()));
create policy agent_turns_select on public.agent_turns for select to authenticated
  using (profile_id = (select auth.uid()) and (select public.is_direction()));

-- Conversations sans échange depuis 90 jours effacées (données de gestion : pas de copie
-- plus longue que nécessaire).
create function public.purge_agent_conversations()
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
  return v_count;
end;
$$;

revoke execute on function public.purge_agent_conversations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-purge-agent', '45 2 * * *', 'select public.purge_agent_conversations()');
  else
    raise notice 'pg_cron indisponible : purge des conversations de l''assistant non planifiée';
  end if;
end;
$$;
