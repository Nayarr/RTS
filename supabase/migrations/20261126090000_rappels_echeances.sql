-- Rappels et échéances envoyés automatiquement au client (retours du client)
--   * Rappel du rendez-vous la veille, par e-mail.
--   * 48 h avant l'échéance du contrôle technique, du contrôle hayon ou du contrôle antipollution
--     (utilitaires), et quand l'entretien d'un contrat est à refaire : e-mail avec un lien vers
--     une page publique de prise de rendez-vous. Le client choisit un créneau libre ; le rendez-vous
--     arrive au bureau « demandé », le bureau le confirme et le client reçoit la confirmation.
--   * Chaque envoi est noté (auto_mail_log) et ne part qu'une fois. Envoi par la fonction
--     auto-mails (Resend), appelée toutes les 15 minutes par une tâche planifiée, si la direction
--     a activé l'envoi par l'appli et les envois automatiques.
--   * Échéance du contrôle antipollution des utilitaires : un an avant le contrôle technique.

-- ---------------------------------------------------------------------------
-- Réglage
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add column auto_mails_enabled boolean not null default true;
comment on column public.app_settings.auto_mails_enabled is
  'Rappels de rendez-vous et e-mails d''échéance envoyés automatiquement (avec l''envoi par l''appli activé).';

-- ---------------------------------------------------------------------------
-- Contrôle antipollution (utilitaires)
-- ---------------------------------------------------------------------------

alter table public.vehicles add column antipollution_due_date date;
comment on column public.vehicles.antipollution_due_date is
  'Utilitaires : contrôle antipollution, un an avant le contrôle technique (modifiable).';

-- Échéance proposée quand le contrôle technique d'un utilitaire change : un an avant, si elle est à venir.
create or replace function public.vehicles_antipollution_default()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vehicle_type <> 'vul' then
    new.antipollution_due_date := null;
  elsif new.ct_due_date is not null
        and (tg_op = 'INSERT' or new.ct_due_date is distinct from old.ct_due_date or old.vehicle_type <> 'vul')
        and (tg_op = 'INSERT' or new.antipollution_due_date is not distinct from old.antipollution_due_date) then
    new.antipollution_due_date := case
      when (new.ct_due_date - interval '1 year')::date >= current_date then (new.ct_due_date - interval '1 year')::date
    end;
  end if;
  return new;
end;
$$;

create trigger vehicles_antipollution_default
  before insert or update of ct_due_date, vehicle_type, antipollution_due_date on public.vehicles
  for each row execute function public.vehicles_antipollution_default();

update public.vehicles
   set antipollution_due_date = (ct_due_date - interval '1 year')::date
 where vehicle_type = 'vul' and ct_due_date is not null and (ct_due_date - interval '1 year')::date >= current_date;

-- Vue des véhicules recréée : la nouvelle colonne y figure (v.* est figé à la création).
drop view public.v_vehicles_overview;
create view public.v_vehicles_overview
with (security_invoker = on) as
select
  v.*,
  c.name as client_name,
  coalesce(r.count, 0) as orders_count,
  r.last_visit,
  m.mileage as last_mileage
from public.vehicles v
left join public.clients c on c.id = v.client_id
left join lateral (
  select count(*) as count, max(created_at) as last_visit from public.repair_orders where vehicle_id = v.id
) r on true
left join lateral (
  select mileage from public.repair_orders
  where vehicle_id = v.id and mileage is not null
  order by created_at desc limit 1
) m on true;
revoke all on public.v_vehicles_overview from public, anon;
grant select on public.v_vehicles_overview to authenticated;

create or replace view public.v_vehicle_deadlines
with (security_invoker = on) as
select
  v.id as vehicle_id,
  v.plate,
  v.client_id,
  c.name as client_name,
  d.kind,
  d.due_date,
  d.due_date - current_date as days_left
from public.vehicles v
left join public.clients c on c.id = v.client_id
cross join lateral (
  values ('ct', v.ct_due_date), ('tailgate', v.tailgate_due_date), ('antipollution', v.antipollution_due_date)
) as d(kind, due_date)
where d.due_date is not null and d.due_date <= current_date + 30;

-- Échéances enregistrées depuis l'OR : l'antipollution aussi.
create or replace function public.update_vehicle_deadlines(p_repair_order_id uuid, p_patch jsonb)
returns public.vehicles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_vehicle public.vehicles;
  v_key text;
  v_vin text;
begin
  v_ro := public.lock_repair_order_for_work(p_repair_order_id);

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key not in ('ct_due_date', 'tailgate_due_date', 'antipollution_due_date', 'vin') then
      raise exception 'Champ non modifiable : %', v_key using errcode = '22023';
    end if;
  end loop;

  -- VIN : 17 caractères, sans I, O ni Q (norme ISO 3779) ; espaces et tirets ignorés.
  if p_patch ? 'vin' then
    v_vin := nullif(upper(regexp_replace(coalesce(p_patch ->> 'vin', ''), '[\s-]', '', 'g')), '');
    if v_vin is not null and v_vin !~ '^[A-HJ-NPR-Z0-9]{17}$' then
      raise exception 'VIN invalide : 17 caractères (lettres sauf I, O, Q, et chiffres)' using errcode = '22023';
    end if;
  end if;

  update public.vehicles set
    ct_due_date       = case when p_patch ? 'ct_due_date' then (p_patch ->> 'ct_due_date')::date else ct_due_date end,
    tailgate_due_date = case when p_patch ? 'tailgate_due_date' then (p_patch ->> 'tailgate_due_date')::date else tailgate_due_date end,
    antipollution_due_date = case when p_patch ? 'antipollution_due_date'
                                  then (p_patch ->> 'antipollution_due_date')::date else antipollution_due_date end,
    vin               = case when p_patch ? 'vin' then v_vin else vin end
  where id = v_ro.vehicle_id
  returning * into v_vehicle;

  return v_vehicle;
end;
$$;

-- ---------------------------------------------------------------------------
-- Liens de prise de rendez-vous et journal des envois automatiques
-- ---------------------------------------------------------------------------

create table public.booking_links (
  token           text primary key default public.generate_public_token(),
  kind            text not null check (kind in ('ct', 'tailgate', 'antipollution', 'maintenance')),
  client_id       uuid not null references public.clients (id) on delete cascade,
  vehicle_id      uuid not null references public.vehicles (id) on delete cascade,
  maintenance_contract_id uuid references public.maintenance_contracts (id) on delete set null,
  due_date        date,
  appointment_id  uuid references public.appointments (id) on delete set null,
  expires_at      timestamptz not null default now() + interval '60 days',
  created_at      timestamptz not null default now()
);
comment on table public.booking_links is
  'Lien envoyé au client avec un e-mail d''échéance : page publique de prise de rendez-vous.';
create index booking_links_vehicle_idx on public.booking_links (vehicle_id, kind, due_date);

create table public.auto_mail_log (
  key                  text primary key,
  kind                 text not null check (kind in (
                         'appointment_reminder', 'appointment_confirmed',
                         'ct', 'tailgate', 'antipollution', 'maintenance')),
  recipient            text not null,
  client_id            uuid references public.clients (id) on delete set null,
  vehicle_id           uuid references public.vehicles (id) on delete set null,
  appointment_id       uuid references public.appointments (id) on delete set null,
  attempts             integer not null default 0,
  provider_message_id  text,
  error                text,
  sent_at              timestamptz,
  created_at           timestamptz not null default now()
);
comment on table public.auto_mail_log is
  'E-mails automatiques (rappels, échéances) : un seul envoi par clé, trois essais au plus en cas d''échec.';
create index auto_mail_log_created_idx on public.auto_mail_log (created_at desc);

alter table public.booking_links enable row level security;
alter table public.auto_mail_log enable row level security;
create policy booking_links_select on public.booking_links for select to authenticated using (public.is_office());
create policy auto_mail_log_select on public.auto_mail_log for select to authenticated using (public.is_office());
revoke all on public.booking_links, public.auto_mail_log from public, anon;
grant select on public.booking_links, public.auto_mail_log to authenticated;

-- ---------------------------------------------------------------------------
-- Créneaux libres
-- ---------------------------------------------------------------------------

-- Créneaux d'une heure, du lundi au vendredi, aux horaires de l'atelier (hors pause déjeuner),
-- tant qu'il reste un technicien libre à cette heure-là.
create or replace function public.booking_free_slots(p_from date, p_days integer default 21)
returns table (slot_date date, slot_time time)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select workday_start, workday_end, lunch_start, lunch_end, friday_lunch_start from public.app_settings
  ),
  capacity as (
    select greatest(count(*), 1) as seats
    from public.technicians where is_active and not exclude_from_planning
  ),
  days as (
    select d::date as day
    from generate_series(p_from, p_from + (p_days - 1), interval '1 day') d
    where extract(isodow from d) between 1 and 5
  ),
  slots as (
    select day, (s.workday_start + make_interval(hours => h))::time as at
    from days, settings s, generate_series(0, 12) h
    where (s.workday_start + make_interval(hours => h + 1))::time <= s.workday_end
  )
  select sl.day, sl.at
  from slots sl, settings s, capacity c
  where not (sl.at < s.lunch_end
             and sl.at + interval '1 hour' > case when extract(isodow from sl.day) = 5 then s.friday_lunch_start else s.lunch_start end)
    and (select count(*) from public.appointments a
         where a.scheduled_date = sl.day and a.status in ('planned', 'requested')
           and a.start_time < sl.at + interval '1 hour'
           and coalesce(a.end_time, a.start_time + interval '1 hour') > sl.at) < c.seats
  order by sl.day, sl.at;
$$;

-- ---------------------------------------------------------------------------
-- Page publique de prise de rendez-vous
-- ---------------------------------------------------------------------------

create or replace function public.booking_reason(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'ct' then 'Contrôle technique'
    when 'tailgate' then 'Contrôle hayon'
    when 'antipollution' then 'Contrôle antipollution'
    else 'Entretien prévu au contrat'
  end;
$$;

-- Lien de prise de rendez-vous : atelier, véhicule, motif, créneaux libres (null si lien inconnu ou expiré).
create or replace function public.public_booking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link public.booking_links;
  v_appointment public.appointments;
  v_from date := public.paris_date(now()) + 1;
begin
  select * into v_link from public.booking_links where token = p_token and expires_at > now();
  if not found then
    return null;
  end if;
  select * into v_appointment from public.appointments
   where id = v_link.appointment_id and status <> 'cancelled';

  return jsonb_build_object(
    'company', (select jsonb_build_object('legal_name', legal_name, 'address_line', address_line,
                                          'postal_code', postal_code, 'city', city, 'email', email,
                                          'phone', phone, 'siret', siret)
                from public.company_settings),
    'plate', (select plate from public.vehicles where id = v_link.vehicle_id),
    'client_name', (select name from public.clients where id = v_link.client_id),
    'reason', public.booking_reason(v_link.kind),
    'due_date', v_link.due_date,
    'appointment', case when v_appointment.id is null then null else jsonb_build_object(
                     'date', v_appointment.scheduled_date, 'time', to_char(v_appointment.start_time, 'HH24:MI'),
                     'status', v_appointment.status) end,
    'slots', case when v_appointment.id is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('date', d.slot_date, 'times', d.times) order by d.slot_date)
      from (
        select slot_date, jsonb_agg(to_char(slot_time, 'HH24:MI') order by slot_time) as times
        from public.booking_free_slots(v_from, 21) group by slot_date
      ) d
    ), '[]'::jsonb) end
  );
end;
$$;

-- Le client choisit un créneau : rendez-vous « demandé », le bureau est prévenu.
create or replace function public.public_book_appointment(p_token text, p_date date, p_time time)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.booking_links;
  v_vehicle public.vehicles;
  v_id uuid;
  v_reason text;
begin
  select * into v_link from public.booking_links where token = p_token and expires_at > now() for update;
  if not found then
    raise exception 'Lien introuvable ou expiré' using errcode = 'P0002';
  end if;
  if v_link.appointment_id is not null
     and exists (select 1 from public.appointments where id = v_link.appointment_id and status <> 'cancelled') then
    raise exception 'Un rendez-vous est déjà demandé avec ce lien' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.booking_free_slots(public.paris_date(now()) + 1, 21)
                 where slot_date = p_date and slot_time = p_time) then
    raise exception 'Ce créneau n''est plus libre : choisis-en un autre' using errcode = 'P0001';
  end if;

  select * into v_vehicle from public.vehicles where id = v_link.vehicle_id;
  v_reason := public.booking_reason(v_link.kind);
  insert into public.appointments (client_id, vehicle_id, vehicle_type, scheduled_date, start_time, end_time,
                                   reason, status, maintenance_contract_id)
  values (v_link.client_id, v_link.vehicle_id, v_vehicle.vehicle_type, p_date, p_time, p_time + interval '1 hour',
          v_reason || ' (demandé en ligne)', 'requested', v_link.maintenance_contract_id)
  returning id into v_id;
  update public.booking_links set appointment_id = v_id where token = p_token;

  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select role, 'appointment_requested',
         'Rendez-vous demandé : ' || v_vehicle.plate,
         v_reason || ' le ' || to_char(p_date, 'DD/MM/YYYY') || ' à ' || to_char(p_time, 'HH24hMI') || ' : à confirmer',
         '/rendez-vous', 'appointment_requested:' || v_id || ':' || role
  from unnest(array['direction', 'reception']::public.app_role[]) as role;

  return jsonb_build_object('date', p_date, 'time', to_char(p_time, 'HH24:MI'), 'status', 'requested');
end;
$$;

-- Un rendez-vous demandé en ligne reste modifiable (créneau, confirmation, annulation).
create or replace function public.appointments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status not in ('planned', 'requested') and not public.is_migration_context()
     and (new.status, new.scheduled_date, new.start_time, new.end_time, new.client_id, new.vehicle_id,
          new.vehicle_type, new.reason)
         is distinct from
         (old.status, old.scheduled_date, old.start_time, old.end_time, old.client_id, old.vehicle_id,
          old.vehicle_type, old.reason) then
    raise exception 'Ce rendez-vous n''est plus modifiable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Le bureau confirme un rendez-vous demandé en ligne (le client reçoit la confirmation par e-mail).
create or replace function public.confirm_appointment_request(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_office();
  update public.appointments set status = 'planned'
   where id = p_appointment_id and status = 'requested';
  if not found then
    raise exception 'Rendez-vous déjà confirmé ou introuvable' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- E-mails automatiques : préparation (liens créés) et suivi des envois
-- ---------------------------------------------------------------------------

-- E-mails à envoyer maintenant. Rappels et échéances de 8 h à 19 h (heure de Paris) ;
-- confirmations de 7 h à 21 h. Un rendez-vous déjà prévu pour le véhicule évite l'e-mail d'échéance.
create or replace function public.prepare_auto_mails(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.paris_date(p_now);
  v_hour integer := extract(hour from p_now at time zone 'Europe/Paris');
  v_items jsonb := '[]'::jsonb;
  r record;
begin
  -- Confirmations des rendez-vous demandés en ligne
  if v_hour between 7 and 20 then
    for r in
      select a.id, a.scheduled_date, a.start_time, a.reason, c.id as client_id, c.name as client_name, c.email,
             v.id as vehicle_id, v.plate
      from public.booking_links bl
      join public.appointments a on a.id = bl.appointment_id and a.status = 'planned' and a.scheduled_date >= v_today
      join public.clients c on c.id = a.client_id
      left join public.vehicles v on v.id = a.vehicle_id
      where nullif(btrim(c.email), '') is not null
    loop
      v_items := v_items || jsonb_build_object(
        'key', 'appointment_confirmed:' || r.id, 'kind', 'appointment_confirmed', 'to', r.email,
        'client_id', r.client_id, 'vehicle_id', r.vehicle_id, 'appointment_id', r.id,
        'client_name', r.client_name, 'plate', r.plate, 'reason', r.reason,
        'date', r.scheduled_date, 'time', to_char(r.start_time, 'HH24:MI'));
    end loop;
  end if;

  if v_hour between 8 and 18 then
    -- Rappel la veille
    for r in
      select a.id, a.scheduled_date, a.start_time, a.reason, c.id as client_id, c.name as client_name, c.email,
             v.id as vehicle_id, v.plate
      from public.appointments a
      join public.clients c on c.id = a.client_id
      left join public.vehicles v on v.id = a.vehicle_id
      where a.status = 'planned' and a.scheduled_date = v_today + 1 and a.reminder_sent_at is null
        and nullif(btrim(c.email), '') is not null
    loop
      v_items := v_items || jsonb_build_object(
        'key', 'appointment_reminder:' || r.id, 'kind', 'appointment_reminder', 'to', r.email,
        'client_id', r.client_id, 'vehicle_id', r.vehicle_id, 'appointment_id', r.id,
        'client_name', r.client_name, 'plate', r.plate, 'reason', r.reason,
        'date', r.scheduled_date, 'time', to_char(r.start_time, 'HH24:MI'));
    end loop;

    -- Échéances dans les 48 h (contrôle technique, hayon, antipollution)
    for r in
      select v.id as vehicle_id, v.plate, c.id as client_id, c.name as client_name, c.email, d.kind, d.due_date
      from public.vehicles v
      join public.clients c on c.id = v.client_id
      cross join lateral (
        values ('ct', v.ct_due_date), ('tailgate', v.tailgate_due_date), ('antipollution', v.antipollution_due_date)
      ) as d(kind, due_date)
      where d.due_date between v_today and v_today + 2
        and nullif(btrim(c.email), '') is not null
        and not exists (select 1 from public.appointments a
                        where a.vehicle_id = v.id and a.status in ('planned', 'requested') and a.scheduled_date >= v_today)
    loop
      v_items := v_items || public.auto_mail_deadline_item(
        r.kind, r.client_id, r.client_name, r.email, r.vehicle_id, r.plate, r.due_date, null);
    end loop;

    -- Entretien des contrats à refaire
    for r in
      select s.contract_id, s.vehicle_id, s.plate, s.last_service_at, mc.starts_on,
             c.id as client_id, c.name as client_name, c.email
      from public.v_contract_vehicle_status s
      join public.maintenance_contracts mc on mc.id = s.contract_id
      join public.clients c on c.id = s.client_id
      where s.service_due and not s.appointment_planned
        and nullif(btrim(c.email), '') is not null
        and not exists (select 1 from public.appointments a
                        where a.vehicle_id = s.vehicle_id and a.status in ('planned', 'requested') and a.scheduled_date >= v_today)
    loop
      v_items := v_items || public.auto_mail_deadline_item(
        'maintenance', r.client_id, r.client_name, r.email, r.vehicle_id, r.plate,
        coalesce(r.last_service_at::date, r.starts_on), r.contract_id);
    end loop;
  end if;

  -- Déjà envoyés, ou trois échecs : écartés
  return coalesce((
    select jsonb_agg(item)
    from jsonb_array_elements(v_items) item
    where not exists (select 1 from public.auto_mail_log l
                      where l.key = item ->> 'key' and (l.sent_at is not null or l.attempts >= 3))
  ), '[]'::jsonb);
end;
$$;

-- Élément d'e-mail d'échéance, avec son lien de prise de rendez-vous (réutilisé s'il existe).
create or replace function public.auto_mail_deadline_item(
  p_kind text, p_client_id uuid, p_client_name text, p_email text, p_vehicle_id uuid, p_plate text,
  p_due_date date, p_contract_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := p_kind || ':' || p_vehicle_id || ':' || coalesce(p_due_date::text, '-')
                || coalesce(':' || p_contract_id, '');
  v_token text;
begin
  if exists (select 1 from public.auto_mail_log where key = v_key and (sent_at is not null or attempts >= 3)) then
    return jsonb_build_object('key', v_key);
  end if;
  select token into v_token from public.booking_links
   where vehicle_id = p_vehicle_id and kind = p_kind and due_date is not distinct from p_due_date and expires_at > now()
   order by created_at desc limit 1;
  if v_token is null then
    insert into public.booking_links (kind, client_id, vehicle_id, maintenance_contract_id, due_date,
                                      expires_at)
    values (p_kind, p_client_id, p_vehicle_id, p_contract_id, p_due_date,
            greatest(now(), coalesce(p_due_date, current_date)::timestamptz) + interval '60 days')
    returning token into v_token;
  end if;
  return jsonb_build_object(
    'key', v_key, 'kind', p_kind, 'to', p_email, 'client_id', p_client_id, 'vehicle_id', p_vehicle_id,
    'client_name', p_client_name, 'plate', p_plate, 'reason', public.booking_reason(p_kind),
    'due_date', p_due_date, 'token', v_token);
end;
$$;

-- Résultat d'un envoi : envoyé (identifiant Resend) ou échec (message). Le rappel marque le rendez-vous.
create or replace function public.record_auto_mail(
  p_key text, p_kind text, p_recipient text, p_client_id uuid, p_vehicle_id uuid, p_appointment_id uuid,
  p_provider_message_id text, p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auto_mail_log as l (key, kind, recipient, client_id, vehicle_id, appointment_id,
                                         attempts, provider_message_id, error, sent_at)
  values (p_key, p_kind, p_recipient, p_client_id, p_vehicle_id, p_appointment_id, 1,
          p_provider_message_id, p_error, case when p_error is null then now() end)
  on conflict (key) do update set
    attempts = l.attempts + 1,
    provider_message_id = coalesce(excluded.provider_message_id, l.provider_message_id),
    error = excluded.error,
    sent_at = coalesce(l.sent_at, excluded.sent_at);
  if p_error is null and p_kind = 'appointment_reminder' and p_appointment_id is not null then
    update public.appointments set reminder_sent_at = now() where id = p_appointment_id and reminder_sent_at is null;
  end if;
end;
$$;

-- Tâche planifiée : appelle la fonction d'envoi si l'envoi par l'appli et les envois automatiques sont activés.
create or replace function public.run_auto_mails()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_settings where mail_send_enabled and auto_mails_enabled) then
    return null;
  end if;
  return public.invoke_edge_function('auto-mails');
end;
$$;

revoke execute on function
  public.vehicles_antipollution_default(),
  public.booking_free_slots(date, integer),
  public.prepare_auto_mails(timestamptz),
  public.auto_mail_deadline_item(text, uuid, text, text, uuid, text, date, uuid),
  public.record_auto_mail(text, text, text, uuid, uuid, uuid, text, text),
  public.run_auto_mails()
from public, anon, authenticated;
grant execute on function public.prepare_auto_mails(timestamptz),
  public.record_auto_mail(text, text, text, uuid, uuid, uuid, text, text) to service_role;

revoke execute on function public.booking_reason(text) from public, anon;
grant execute on function public.booking_reason(text) to authenticated;
revoke execute on function public.confirm_appointment_request(uuid) from public, anon;
grant execute on function public.confirm_appointment_request(uuid) to authenticated;

-- Page publique : seules ces deux fonctions sont ouvertes aux visiteurs (jeton du lien).
revoke execute on function public.public_booking(text), public.public_book_appointment(text, date, time)
  from public;
grant execute on function public.public_booking(text), public.public_book_appointment(text, date, time)
  to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-auto-mails', '*/15 * * * *', 'select public.run_auto_mails()');
  else
    raise notice 'pg_cron indisponible : e-mails automatiques non planifiés';
  end if;
end;
$$;
