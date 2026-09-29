-- =============================================================================
-- RTS Atelier — Notifications push (Web Push standard, sans Firebase)
--
-- Comme l'ancienne appli, le téléphone sonne même verrouillé :
--   - technicien : OR nouveau ou modifié (programme, horaire, travaux demandés) ;
--   - direction  : demande de congé ;
--   - bureau     : devis accepté ou refusé en ligne par le client.
-- Les événements remplissent la file push_outbox ; l'Edge Function « push-send »
-- chiffre et envoie chaque message aux appareils abonnés (push_subscriptions).
-- Elle est appelée tout de suite (pg_net) et, en secours, chaque minute (pg_cron).
-- =============================================================================

create table public.push_outbox (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (btrim(title) <> ''),
  body        text,
  link        text,                                     -- écran de l'appli ouvert au toucher
  tag         text,                                     -- même tag = la notification remplace la précédente
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,                              -- pris en charge par l'Edge Function
  attempts    integer not null default 0
);
comment on table public.push_outbox is 'Notifications push à envoyer (file traitée par l''Edge Function push-send).';
create index push_outbox_pending_idx on public.push_outbox (created_at) where sent_at is null;
create index push_outbox_profile_idx on public.push_outbox (profile_id);

-- File interne : jamais lisible depuis l'appli (RLS sans politique).
alter table public.push_outbox enable row level security;

-- ---------------------------------------------------------------------------
-- Mise en file : seulement pour les comptes actifs ayant au moins un appareil abonné.
-- Un message non encore parti avec le même tag est remplacé (modifications successives).
-- ---------------------------------------------------------------------------
create or replace function public.queue_push(
  p_profile_ids uuid[],
  p_title text,
  p_body text default null,
  p_link text default null,
  p_tag text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_count integer := 0;
begin
  for v_profile in
    select distinct p.id
    from public.profiles p
    where p.id = any (p_profile_ids) and p.is_active
      and exists (select 1 from public.push_subscriptions s where s.profile_id = p.id)
      and p.id is distinct from auth.uid()          -- jamais pour sa propre action
  loop
    update public.push_outbox
       set title = p_title, body = p_body, link = p_link, created_at = now()
     where profile_id = v_profile and tag = p_tag and sent_at is null;
    if not found then
      insert into public.push_outbox (profile_id, title, body, link, tag)
      values (v_profile, p_title, p_body, p_link, p_tag);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Comptes actifs d'un ou plusieurs rôles.
create or replace function public.profiles_with_roles(p_roles public.app_role[])
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(id), '{}') from public.profiles where role = any (p_roles) and is_active;
$$;

-- ---------------------------------------------------------------------------
-- Technicien : OR nouveau ou modifié
-- ---------------------------------------------------------------------------
create or replace function public.repair_orders_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_plate text;
  v_when text;
begin
  if new.technician_id is null or new.status not in ('assigned', 'in_progress') then
    return null;
  end if;
  -- Mêmes changements que ceux qui affichent « Modifié » chez le technicien.
  if tg_op = 'UPDATE'
     and new.technician_id is not distinct from old.technician_id
     and new.planned_date is not distinct from old.planned_date
     and new.planned_start is not distinct from old.planned_start
     and new.planned_end is not distinct from old.planned_end
     and new.requested_work is not distinct from old.requested_work then
    return null;
  end if;

  select profile_id into v_profile from public.technicians where id = new.technician_id;
  if v_profile is null then
    return null;
  end if;
  select plate into v_plate from public.vehicles where id = new.vehicle_id;
  v_when := case
    when new.planned_date is null then null
    else 'Prévu le ' || to_char(new.planned_date, 'DD/MM')
         || coalesce(' à ' || to_char(new.planned_start, 'HH24"h"MI'), '') end;

  perform public.queue_push(
    array[v_profile],
    case when tg_op = 'INSERT' or new.technician_id is distinct from old.technician_id
         then 'Nouvel OR : ' else 'OR modifié : ' end || coalesce(v_plate, new.number),
    concat_ws(' — ', nullif(left(btrim(new.requested_work), 120), ''), v_when),
    '/atelier/or/' || new.id,
    'ro-' || new.id);
  return null;
end;
$$;

create trigger repair_orders_push
  after insert or update on public.repair_orders
  for each row execute function public.repair_orders_push();

-- ---------------------------------------------------------------------------
-- Direction : demande de congé d'un technicien
-- ---------------------------------------------------------------------------
create or replace function public.leave_requests_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'requested' then
    return null;
  end if;
  perform public.queue_push(
    public.profiles_with_roles(array['direction']::public.app_role[]),
    'Demande de congé : ' || (select display_name from public.technicians where id = new.technician_id),
    'Du ' || to_char(new.starts_on, 'DD/MM/YYYY') || ' au ' || to_char(new.ends_on, 'DD/MM/YYYY'),
    '/pointages/conges',
    'leave-' || new.id);
  return null;
end;
$$;

create trigger leave_requests_push
  after insert on public.leave_requests
  for each row execute function public.leave_requests_push();

-- ---------------------------------------------------------------------------
-- Bureau : réponse d'un client à un devis en ligne (alerte de la cloche envoyée aussi en push)
-- ---------------------------------------------------------------------------
create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.type <> 'quote_response' then
    return null;
  end if;
  perform public.queue_push(
    case when new.recipient_profile_id is not null then array[new.recipient_profile_id]
         else public.profiles_with_roles(array[new.recipient_role]) end,
    new.title, new.body, new.link, 'notification-' || coalesce(new.dedupe_key, new.id::text));
  return null;
end;
$$;

create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.notifications_push();

-- ---------------------------------------------------------------------------
-- Envoi : tout de suite après chaque mise en file, et chaque minute en secours.
-- ---------------------------------------------------------------------------
create or replace function public.push_outbox_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.invoke_edge_function('push-send');
  return null;
end;
$$;

create trigger push_outbox_dispatch
  after insert on public.push_outbox
  for each statement execute function public.push_outbox_dispatch();

create or replace function public.dispatch_push()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
begin
  -- Messages anciens (ou abandonnés après 5 essais) retirés de la file.
  delete from public.push_outbox where created_at < now() - interval '30 days';
  update public.push_outbox set sent_at = now()
  where sent_at is null and (attempts >= 5 or created_at < now() - interval '1 day');

  select count(*) into v_pending from public.push_outbox where sent_at is null;
  if v_pending > 0 then
    perform public.invoke_edge_function('push-send');
  end if;
  return v_pending;
end;
$$;

-- ---------------------------------------------------------------------------
-- Utilisées par l'Edge Function (clé de service)
-- ---------------------------------------------------------------------------

-- Prend un lot de messages (marqués pris en charge) avec les appareils de leur destinataire.
create or replace function public.claim_push_batch(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.push_outbox o set sent_at = now(), attempts = o.attempts + 1
    where o.id in (
      select id from public.push_outbox
      where sent_at is null and attempts < 5
      order by created_at
      limit least(greatest(p_limit, 1), 200)
      for update skip locked)
    returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'title', c.title, 'body', c.body, 'link', c.link, 'tag', c.tag,
           'subscriptions', coalesce((
             select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint,
                                                 'p256dh', s.p256dh, 'auth', s.auth_key))
             from public.push_subscriptions s where s.profile_id = c.profile_id), '[]'::jsonb))
         order by c.created_at), '[]'::jsonb)
  from claimed c;
$$;

-- Résultat de l'envoi : appareils désabonnés supprimés, messages en échec remis en file.
create or replace function public.record_push_results(
  p_delivered uuid[],
  p_gone uuid[],
  p_retry uuid[]
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_used_at = now() where id = any (p_delivered);
  delete from public.push_subscriptions where id = any (p_gone);
  update public.push_outbox set sent_at = null where id = any (p_retry) and attempts < 5;
$$;

-- ---------------------------------------------------------------------------
-- Depuis l'appli
-- ---------------------------------------------------------------------------

-- Abonnement de cet appareil pour le compte connecté (un appareil = un seul compte :
-- s'il servait à un autre compte, l'ancien abonnement est remplacé).
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.current_app_role() is null then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_endpoint !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Abonnement aux notifications invalide' using errcode = '22023';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth_key, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200));
end;
$$;

-- Notification d'essai sur ses propres appareils (confirmation de l'activation).
create or replace function public.send_test_push()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.push_subscriptions where profile_id = auth.uid()) then
    raise exception 'Aucun appareil abonné aux notifications' using errcode = 'P0002';
  end if;
  insert into public.push_outbox (profile_id, title, body, link, tag)
  values (auth.uid(), 'Notifications activées', 'Tu seras prévenu ici, même téléphone verrouillé.', '/', 'test');
end;
$$;

revoke execute on function
  public.queue_push(uuid[], text, text, text, text),
  public.profiles_with_roles(public.app_role[]),
  public.repair_orders_push(),
  public.leave_requests_push(),
  public.notifications_push(),
  public.push_outbox_dispatch(),
  public.dispatch_push(),
  public.claim_push_batch(integer),
  public.record_push_results(uuid[], uuid[], uuid[]),
  public.register_push_subscription(text, text, text, text),
  public.send_test_push()
from public, anon, authenticated;

grant execute on function
  public.register_push_subscription(text, text, text, text),
  public.send_test_push()
to authenticated;
grant execute on function public.claim_push_batch(integer), public.record_push_results(uuid[], uuid[], uuid[])
  to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-dispatch-push', '* * * * *', 'select public.dispatch_push()');
  else
    raise notice 'pg_cron indisponible : envoi de secours des notifications non planifié';
  end if;
end;
$$;
