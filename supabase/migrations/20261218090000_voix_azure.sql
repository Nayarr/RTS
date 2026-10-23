-- =============================================================================
-- Agent Direction : voix naturelle d'Azure (Microsoft), avec la voix du navigateur en secours
--
-- Réglages › Atelier : voix du navigateur (gratuite, sur l'appareil) ou voix Azure (Edge Function
-- « tts », secrets AZURE_SPEECH_KEY et AZURE_SPEECH_REGION). Le niveau gratuit d'Azure (F0) donne
-- 500 000 caractères par mois : l'appli compte les caractères lus et repasse sur la voix du
-- navigateur au-delà du plafond réglé (480 000 par défaut), avant toute facturation.
-- =============================================================================

alter table public.app_settings
  add column tts_provider text not null default 'browser' check (tts_provider in ('browser', 'azure')),
  add column tts_voice text not null default 'fr-FR-DeniseNeural'
    check (tts_voice ~ '^fr-(FR|BE|CH|CA)-[A-Za-z]+(Multilingual)?Neural$'),
  add column tts_monthly_limit integer not null default 480000
    check (tts_monthly_limit between 0 and 500000);
comment on column public.app_settings.tts_provider is
  'Voix de l''Agent Direction : navigateur (gratuite, sur l''appareil) ou Azure (voix neuronale).';
comment on column public.app_settings.tts_voice is 'Voix Azure (ex. fr-FR-DeniseNeural).';
comment on column public.app_settings.tts_monthly_limit is
  'Caractères lus par Azure par mois au plus (niveau gratuit : 500 000) ; au-delà, voix du navigateur.';

-- Caractères envoyés à Azure, par mois (heure de Paris)
create table public.tts_usage (
  month       date primary key check (extract(day from month) = 1),
  characters  integer not null default 0 check (characters >= 0),
  updated_at  timestamptz not null default now()
);
comment on table public.tts_usage is 'Caractères lus par la voix Azure, par mois (plafond du niveau gratuit).';

alter table public.tts_usage enable row level security;
revoke all on public.tts_usage from public, anon, authenticated;
grant select on public.tts_usage to authenticated;
create policy tts_usage_select on public.tts_usage for select to authenticated
  using ((select public.is_direction()));

-- Réserve des caractères du mois avant l'appel à Azure : refuse (null) si le plafond serait dépassé.
-- Appelée par l'Edge Function avec la clé de service.
create or replace function public.tts_reserve(p_characters integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
  v_limit integer := (select tts_monthly_limit from public.app_settings);
  v_total integer;
begin
  if p_characters is null or p_characters <= 0 then
    raise exception 'Nombre de caractères invalide' using errcode = '22023';
  end if;
  insert into public.tts_usage (month, characters) values (v_month, 0) on conflict (month) do nothing;
  update public.tts_usage
     set characters = characters + p_characters, updated_at = now()
   where month = v_month and characters + p_characters <= coalesce(v_limit, 0)
  returning characters into v_total;
  return v_total;
end;
$$;
revoke execute on function public.tts_reserve(integer) from public, anon, authenticated;
grant execute on function public.tts_reserve(integer) to service_role;

-- Lecture refusée par Azure : les caractères réservés sont rendus.
create or replace function public.tts_release(p_characters integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.tts_usage
     set characters = greatest(characters - greatest(p_characters, 0), 0), updated_at = now()
   where month = date_trunc('month', (now() at time zone 'Europe/Paris'))::date;
$$;
revoke execute on function public.tts_release(integer) from public, anon, authenticated;
grant execute on function public.tts_release(integer) to service_role;
