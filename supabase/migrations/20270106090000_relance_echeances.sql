-- =============================================================================
-- Relance des échéances : une relance par véhicule et par contrôle tous les 3 mois au plus
--
-- Demande du client : un bouton sur la page Échéances qui rédige un mail par client pour tous ses
-- véhicules en situation irrégulière (contrôle dépassé ou dans les 30 jours) ; un véhicule relancé
-- ne se relance plus pendant 3 mois, par aucune voie : page Échéances, Agent Direction, rappel
-- automatique (48 h avant, hayon au mois).
-- =============================================================================

create table public.deadline_reminders (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles (id) on delete cascade,
  kind        text not null check (kind in ('ct', 'tailgate', 'antipollution')),
  -- page : bouton de la page Échéances ; agent : mail de l'Agent Direction ; auto : rappel automatique
  source      text not null check (source in ('page', 'agent', 'auto')),
  sent_at     timestamptz not null default now(),
  sent_by     uuid default auth.uid() references public.profiles (id) on delete set null
);
comment on table public.deadline_reminders is
  'Relances des échéances (contrôle technique, hayon, antipollution) : une par véhicule et contrôle tous les 3 mois.';
create index deadline_reminders_vehicle_idx on public.deadline_reminders (vehicle_id, kind, sent_at desc);

alter table public.deadline_reminders enable row level security;
create policy deadline_reminders_select on public.deadline_reminders for select to authenticated
  using (public.is_office());
revoke all on public.deadline_reminders from anon;
grant select on public.deadline_reminders to authenticated;

-- Relancé depuis moins de 3 mois ?
create function public.deadline_recently_reminded(p_vehicle_id uuid, p_kind text, p_now timestamptz default now())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.deadline_reminders r
                 where r.vehicle_id = p_vehicle_id and r.kind = p_kind
                   and r.sent_at > p_now - interval '3 months');
$$;
revoke execute on function public.deadline_recently_reminded(uuid, text, timestamptz) from public, anon;
grant execute on function public.deadline_recently_reminded(uuid, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Relance notée par le bureau : refusée si déjà relancé depuis moins de 3 mois
-- (p_source : page Échéances ; agent pour un mail de l'Agent Direction, noté par mail-send)
-- ---------------------------------------------------------------------------
create function public.record_deadline_reminders(p_items jsonb, p_source text default 'page')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_plate text;
  v_count integer := 0;
begin
  perform public.assert_office();
  if p_source not in ('page', 'agent') then
    raise exception 'Origine de relance inconnue' using errcode = '22023';
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if public.deadline_recently_reminded((v_item ->> 'vehicle_id')::uuid, v_item ->> 'kind') then
      select plate into v_plate from public.vehicles where id = (v_item ->> 'vehicle_id')::uuid;
      raise exception '% déjà relancé depuis moins de 3 mois', coalesce(v_plate, 'Véhicule')
        using errcode = 'P0001';
    end if;
    insert into public.deadline_reminders (vehicle_id, kind, source)
    values ((v_item ->> 'vehicle_id')::uuid, v_item ->> 'kind', p_source);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.record_deadline_reminders(jsonb, text) from public, anon;
grant execute on function public.record_deadline_reminders(jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Rappels automatiques : pas de rappel d'un véhicule relancé, et le rappel compte comme relance
-- ---------------------------------------------------------------------------
create or replace function public.prepare_auto_mails(p_now timestamp with time zone DEFAULT now())
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

    -- Échéances : contrôle technique et antipollution dans les 48 h, hayon dans le mois
    for r in
      select v.id as vehicle_id, v.plate, c.id as client_id, c.name as client_name, c.email, d.kind, d.due_date
      from public.vehicles v
      join public.clients c on c.id = v.client_id
      cross join lateral (
        values ('ct', v.ct_due_date), ('tailgate', v.tailgate_due_date), ('antipollution', v.antipollution_due_date)
      ) as d(kind, due_date)
      -- Hayon (mois seulement) : e-mail dès le 1er du mois d'échéance ; les autres 48 h avant
      where ((d.kind <> 'tailgate' and d.due_date between v_today and v_today + 2)
             or (d.kind = 'tailgate' and d.due_date = date_trunc('month', v_today)::date))
        and nullif(btrim(c.email), '') is not null
        and not exists (select 1 from public.appointments a
                        where a.vehicle_id = v.id and a.status in ('planned', 'requested') and a.scheduled_date >= v_today)
        -- Déjà relancé depuis moins de 3 mois (page Échéances, Agent Direction, rappel automatique)
        and not public.deadline_recently_reminded(v.id, d.kind, p_now)
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

create or replace function public.record_auto_mail(p_key text, p_kind text, p_recipient text, p_client_id uuid, p_vehicle_id uuid, p_appointment_id uuid, p_provider_message_id text, p_error text, p_rental_id uuid DEFAULT NULL::uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auto_mail_log as l (key, kind, recipient, client_id, vehicle_id, appointment_id, rental_id,
                                         attempts, provider_message_id, error, sent_at)
  values (p_key, p_kind, p_recipient, p_client_id, p_vehicle_id, p_appointment_id, p_rental_id, 1,
          p_provider_message_id, p_error, case when p_error is null then now() end)
  on conflict (key) do update set
    attempts = l.attempts + 1,
    provider_message_id = coalesce(excluded.provider_message_id, l.provider_message_id),
    error = excluded.error,
    sent_at = coalesce(l.sent_at, excluded.sent_at);
  if p_error is null and p_kind = 'appointment_reminder' and p_appointment_id is not null then
    update public.appointments set reminder_sent_at = now() where id = p_appointment_id and reminder_sent_at is null;
  end if;
  -- Rappel d'échéance parti : noté dans les relances (pas de nouvelle relance pendant 3 mois)
  if p_error is null and p_kind in ('ct', 'tailgate', 'antipollution') and p_vehicle_id is not null
     and not public.deadline_recently_reminded(p_vehicle_id, p_kind) then
    insert into public.deadline_reminders (vehicle_id, kind, source, sent_by)
    values (p_vehicle_id, p_kind, 'auto', null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Page Échéances : e-mail du client et dernière relance (moins de 3 mois)
-- ---------------------------------------------------------------------------
create or replace view public.v_vehicle_deadlines
with (security_invoker = on) as
 SELECT v.id AS vehicle_id,
    v.plate,
    v.client_id,
    c.name AS client_name,
    d.kind,
    d.due_date,
    (d.due_date - CURRENT_DATE) AS days_left,
    c.email AS client_email,
    ( SELECT max(r.sent_at) AS max
           FROM deadline_reminders r
          WHERE ((r.vehicle_id = v.id) AND (r.kind = d.kind) AND (r.sent_at > (now() - '3 mons'::interval)))) AS reminded_at
   FROM ((vehicles v
     LEFT JOIN clients c ON ((c.id = v.client_id)))
     CROSS JOIN LATERAL ( VALUES ('ct'::text,v.ct_due_date), ('tailgate'::text,(((v.tailgate_due_date + '1 mon'::interval) - '1 day'::interval))::date), ('antipollution'::text,v.antipollution_due_date)) d(kind, due_date))
  WHERE ((d.due_date IS NOT NULL) AND (d.due_date <= (CURRENT_DATE + 30)));
