-- =============================================================================
-- Fiabilité des liens envoyés aux clients et de la borne
--
-- 1. Lien ouvert sans document trouvé (« introuvable ou expiré ») : noté en base (heure,
--    début du jeton, navigateur) pour comprendre après coup un lien déformé par une
--    messagerie, un ancien lien ou une erreur de copie. Gardé 30 jours.
-- 2. Borne : signale qu'elle est allumée (toutes les 30 s) ; le bureau voit si elle est en
--    ligne avant de lui envoyer une signature.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Liens introuvables
-- ---------------------------------------------------------------------------

create table public.public_link_misses (
  id            bigint generated always as identity primary key,
  token_prefix  text not null,          -- 12 premiers caractères : assez pour comparer, pas pour ouvrir
  token_length  integer not null,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index public_link_misses_created_at_idx on public.public_link_misses (created_at);
alter table public.public_link_misses enable row level security;

create policy public_link_misses_select on public.public_link_misses
  for select to authenticated using (public.current_app_role() = 'direction');

-- La recherche du document reste inchangée (renommée) ; public_get_document l'appelle
-- puis note le lien quand rien n'est trouvé. Toute évolution des documents publics se fait
-- désormais dans public_find_document.
alter function public.public_get_document(text) rename to public_find_document;
revoke execute on function public.public_find_document(text) from public, anon, authenticated;

create function public.public_get_document(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document jsonb := public.public_find_document(p_token);
begin
  if v_document is null and p_token is not null
     -- Garde-fou : un robot qui essaie des liens au hasard ne remplit pas la table.
     and (select count(*) from public.public_link_misses where created_at > now() - interval '1 hour') < 200 then
    insert into public.public_link_misses (token_prefix, token_length, user_agent)
    values (left(p_token, 12), length(p_token),
            left(current_setting('request.headers', true)::jsonb ->> 'user-agent', 300));
  end if;
  return v_document;
end;
$$;
grant execute on function public.public_get_document(text) to anon, authenticated;

create function public.purge_public_link_misses()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.public_link_misses where created_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.purge_public_link_misses() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Borne en ligne
-- ---------------------------------------------------------------------------

create table public.kiosk_presence (
  profile_id    uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at  timestamptz not null default now()
);
alter table public.kiosk_presence enable row level security;
-- Écrite seulement par kiosk_ping() ; lisible par le bureau.
create policy kiosk_presence_select on public.kiosk_presence
  for select to authenticated using (public.is_office());

-- Borne : « je suis allumée ».
create function public.kiosk_ping()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_kiosk() then
    raise exception 'Accès réservé à la borne' using errcode = '42501';
  end if;
  insert into public.kiosk_presence (profile_id, last_seen_at) values (auth.uid(), now())
  on conflict (profile_id) do update set last_seen_at = excluded.last_seen_at;
end;
$$;
revoke execute on function public.kiosk_ping() from public, anon;
grant execute on function public.kiosk_ping() to authenticated;

-- Bureau : dernier signe de vie d'une borne (null : jamais vue), mesuré par le serveur.
create function public.kiosk_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  perform public.assert_office();
  select max(last_seen_at) into v_last from public.kiosk_presence;
  return jsonb_build_object(
    'last_seen_at', v_last,
    'seconds_ago', case when v_last is null then null else floor(extract(epoch from now() - v_last))::integer end);
end;
$$;
revoke execute on function public.kiosk_status() from public, anon;
grant execute on function public.kiosk_status() to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-purge-link-misses', '50 2 * * *', 'select public.purge_public_link_misses()');
  else
    raise notice 'pg_cron indisponible : purge des liens introuvables non planifiée';
  end if;
end;
$$;
