-- =============================================================================
-- Échéance du contrôle hayon : mois et année seulement
-- =============================================================================
-- Les étiquettes de hayon ne donnent qu'un mois et une année (lus au format MMAAAA). La colonne
-- vehicles.tailgate_due_date garde le mois d'échéance, toujours au 1er jour du mois ; le contrôle
-- est valable jusqu'à la fin de ce mois (échéances, rappels).

update public.vehicles
   set tailgate_due_date = date_trunc('month', tailgate_due_date)::date
 where tailgate_due_date is not null and extract(day from tailgate_due_date) <> 1;

create function public.vehicles_tailgate_month()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tailgate_due_date := date_trunc('month', new.tailgate_due_date)::date;
  return new;
end;
$$;
revoke execute on function public.vehicles_tailgate_month() from public, anon, authenticated;

create trigger vehicles_tailgate_month
  before insert or update of tailgate_due_date on public.vehicles
  for each row when (new.tailgate_due_date is not null)
  execute function public.vehicles_tailgate_month();

alter table public.vehicles add constraint vehicles_tailgate_due_month
  check (tailgate_due_date is null or extract(day from tailgate_due_date) = 1);

comment on column public.vehicles.tailgate_due_date is
  'Mois d''échéance du contrôle hayon (1er jour du mois) : valable jusqu''à la fin de ce mois.';

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
  -- Hayon : valable jusqu'à la fin du mois indiqué
  values ('ct', v.ct_due_date),
         ('tailgate', (v.tailgate_due_date + interval '1 month' - interval '1 day')::date),
         ('antipollution', v.antipollution_due_date)
) as d(kind, due_date)
where d.due_date is not null and d.due_date <= current_date + 30;

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
