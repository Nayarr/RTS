-- =============================================================================
-- RTS Atelier : alertes à action aussi en push, accueil tenu à jour en direct
--
--   - bureau : toute alerte de la cloche qui demande une action part aussi en push
--     (la nuit, gardée jusqu'à 7 h ; réponse d'un client à un devis : tout de suite) ;
--   - bureau : devis accepté ou refusé de n'importe quelle façon (réponse saisie au bureau
--     comprise), direction et réception prévenues ;
--   - technicien : congé accepté ou refusé, OR rouvert par le bureau ;
--   - accueil : factures et congés suivis en direct (Supabase Realtime).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Envoi différé : message gardé dans la file jusqu'à l'heure prévue
-- ---------------------------------------------------------------------------
alter table public.push_outbox add column not_before timestamptz;
comment on column public.push_outbox.not_before is
  'Envoi pas avant cette heure (alerte de nuit gardée jusqu''au matin) ; vide : tout de suite.';

-- Nuit (21 h - 7 h, heure de Paris) : 7 h du matin suivant, sinon vide (envoi immédiat).
create function public.push_quiet_until(p_now timestamptz default now())
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when extract(hour from p_now at time zone 'Europe/Paris') >= 21
      then ((p_now at time zone 'Europe/Paris')::date + 1 + time '07:00') at time zone 'Europe/Paris'
    when extract(hour from p_now at time zone 'Europe/Paris') < 7
      then ((p_now at time zone 'Europe/Paris')::date + time '07:00') at time zone 'Europe/Paris'
  end;
$$;

drop function public.queue_push(uuid[], text, text, text, text);
create function public.queue_push(
  p_profile_ids uuid[],
  p_title text,
  p_body text default null,
  p_link text default null,
  p_tag text default null,
  p_not_before timestamptz default null
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
       set title = p_title, body = p_body, link = p_link, created_at = now(), not_before = p_not_before
     where profile_id = v_profile and tag = p_tag and sent_at is null;
    if not found then
      insert into public.push_outbox (profile_id, title, body, link, tag, not_before)
      values (v_profile, p_title, p_body, p_link, p_tag, p_not_before);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

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
      where sent_at is null and attempts < 5 and (not_before is null or not_before <= now())
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
  where sent_at is null
    and (attempts >= 5 or coalesce(not_before, created_at) < now() - interval '1 day');

  -- Seulement les messages à envoyer maintenant (ceux de la nuit attendent le matin)
  select count(*) into v_pending from public.push_outbox
  where sent_at is null and (not_before is null or not_before <= now());
  if v_pending > 0 then
    perform public.invoke_edge_function('push-send');
  end if;
  return v_pending;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bureau : alertes de la cloche qui demandent une action, aussi en push
-- ---------------------------------------------------------------------------
create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Information seule (location reconduite, OR signé, rappel des congés déjà poussés) : cloche seulement
  if new.type not in ('quote_response', 'pre_quote_work', 'kiosk_lockout', 'appointment_requested',
                      'rental_renewal_blocked', 'late_repair_order', 'overdue_invoice', 'low_stock',
                      'contract_service_due', 'appointment_reminder') then
    return null;
  end if;
  perform public.queue_push(
    case when new.recipient_profile_id is not null then array[new.recipient_profile_id]
         else public.profiles_with_roles(array[new.recipient_role]) end,
    new.title, new.body, new.link, 'notification-' || coalesce(new.dedupe_key, new.id::text),
    -- Réponse d'un client : tout de suite ; le reste attend le matin la nuit
    case when new.type <> 'quote_response' then public.push_quiet_until() end);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bureau : devis accepté ou refusé saisi au bureau (téléphone, passage du client…).
-- En ligne et sur la borne, l'alerte est déjà créée avec la signature.
-- ---------------------------------------------------------------------------
create function public.quotes_response_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
begin
  if new.status not in ('accepted', 'refused') or old.status in ('accepted', 'refused')
     or not public.is_office() then
    return null;
  end if;
  v_title := 'Devis ' || coalesce(new.number, '') || ' '
             || case when new.status = 'accepted' then 'accepté' else 'refusé' end
             || coalesce(' (saisi par ' || nullif(btrim((select full_name from public.profiles where id = auth.uid())), '') || ')', '');
  v_body := concat_ws(' · ',
    nullif((select name from public.clients where id = new.client_id), ''),
    (select plate from public.vehicles where id = new.vehicle_id));
  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  select role, 'quote_response', v_title, v_body, new.repair_order_id, '/devis/' || new.id,
         'quote-response-' || new.id || '-' || role
  from (values ('direction'::public.app_role), ('reception'::public.app_role)) roles(role)
  on conflict (dedupe_key) do nothing;
  return null;
end;
$$;

create trigger quotes_response_notify
  after update of status on public.quotes
  for each row execute function public.quotes_response_notify();

-- ---------------------------------------------------------------------------
-- Technicien : congé accepté ou refusé par la direction
-- ---------------------------------------------------------------------------
create function public.leave_requests_decided_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
begin
  if old.status <> 'requested' or new.status not in ('approved', 'rejected') then
    return null;
  end if;
  select profile_id into v_profile from public.technicians where id = new.technician_id;
  if v_profile is null then
    return null;
  end if;
  perform public.queue_push(
    array[v_profile],
    case when new.status = 'approved' then 'Congé accepté' else 'Congé refusé' end,
    'Du ' || to_char(new.starts_on, 'DD/MM/YYYY') || ' au ' || to_char(new.ends_on, 'DD/MM/YYYY'),
    '/conges',
    'leave-decided-' || new.id);
  return null;
end;
$$;

create trigger leave_requests_decided_push
  after update of status on public.leave_requests
  for each row execute function public.leave_requests_decided_push();

-- ---------------------------------------------------------------------------
-- Technicien : OR nouveau, modifié ou rouvert par le bureau (de nouveau modifiable)
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
  v_reopened boolean;
begin
  if new.technician_id is null or new.status not in ('assigned', 'in_progress') then
    return null;
  end if;
  v_reopened := tg_op = 'UPDATE' and old.status not in ('assigned', 'in_progress');
  -- Mêmes changements que ceux qui affichent « Modifié » chez le technicien.
  if tg_op = 'UPDATE' and not v_reopened
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
    case when tg_op = 'INSERT' or new.technician_id is distinct from old.technician_id then 'Nouvel OR : '
         when v_reopened then 'OR rouvert : '
         else 'OR modifié : ' end || coalesce(v_plate, new.number),
    concat_ws(' · ', nullif(left(btrim(new.requested_work), 120), ''), v_when),
    '/atelier/or/' || new.id,
    'ro-' || new.id);
  return null;
end;
$$;

revoke execute on function
  public.push_quiet_until(timestamptz),
  public.queue_push(uuid[], text, text, text, text, timestamptz),
  public.quotes_response_notify(),
  public.leave_requests_decided_push()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Accueil en direct : factures et congés suivis comme les OR, devis et rendez-vous
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.invoices, public.leave_requests;
  end if;
end;
$$;
