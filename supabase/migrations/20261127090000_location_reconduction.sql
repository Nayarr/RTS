-- Location : durée au jour, au mois ou à l'année, tacite reconduction (retours du client)
--   * Le contrat se choisit aussi à l'année (tarif annuel du véhicule).
--   * Tacite reconduction : un véhicule loué non rendu à la date prévue prolonge le contrat d'une
--     unité à la fois (1 jour, 1 semaine, 1 mois ou 1 an selon le tarif) ; la facture suit (une
--     période de plus), le bureau est prévenu. Si le véhicule est déjà réservé ensuite, le bureau
--     est prévenu sans prolonger.
--   * À l'approche de la fin du contrat, e-mail automatique au client (avec les e-mails automatiques
--     de l'appli) : date de fin, et reconduction s'il ne rend pas le véhicule.

-- ---------------------------------------------------------------------------
-- Durée à l'année
-- ---------------------------------------------------------------------------

alter table public.rentals drop constraint rentals_rate_period_check;
alter table public.rentals
  add constraint rentals_rate_period_check check (rate_period in ('day', 'weekend', 'week', 'month', 'year'));

alter table public.fleet_vehicles
  add column year_rate numeric(10,2) check (year_rate >= 0);
comment on column public.fleet_vehicles.year_rate is 'Tarif HT à l''année (contrat annuel).';

alter table public.rentals
  add column tacit_renewal boolean not null default true,
  add column renewals integer not null default 0 check (renewals >= 0);
comment on column public.rentals.tacit_renewal is
  'Location non rendue à la date prévue : prolongée d''une unité du tarif à la fois (jour, semaine, mois, an).';
comment on column public.rentals.renewals is 'Nombre de reconductions tacites déjà appliquées.';

-- Vue recréée : les nouvelles colonnes y figurent (r.* est figé à la création).
drop view public.v_rentals_overview;
create view public.v_rentals_overview
with (security_invoker = on) as
select
  r.*,
  c.name as client_name,
  c.kind as client_kind,
  c.phone as client_phone,
  v.plate,
  v.brand,
  v.model,
  v.category,
  ro.number as repair_order_number,
  i.number as invoice_number,
  (r.status = 'active' and r.planned_return_at < now()) as is_late,
  round(r.unit_price * r.periods * (1 - r.discount_percent / 100), 2) as estimated_ht
from public.rentals r
join public.clients c on c.id = r.client_id
join public.fleet_vehicles v on v.id = r.fleet_vehicle_id
left join public.repair_orders ro on ro.id = r.repair_order_id
left join public.invoices i on i.id = r.invoice_id;

revoke all on public.v_rentals_overview from public, anon;
grant select on public.v_rentals_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Tacite reconduction
-- ---------------------------------------------------------------------------

-- Unité de reconduction du tarif : le week-end se prolonge au jour.
create or replace function public.rental_renewal_step(p_rate_period text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case p_rate_period
    when 'week' then interval '7 days'
    when 'month' then interval '1 month'
    when 'year' then interval '1 year'
    else interval '1 day'
  end;
$$;

create or replace function public.rental_unit_label(p_rate_period text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_rate_period
    when 'week' then 'une semaine'
    when 'month' then 'un mois'
    when 'year' then 'un an'
    else 'un jour'
  end;
$$;

-- Locations parties, non rendues, dont la fin prévue est passée : une unité de plus, autant de fois
-- que nécessaire pour dépasser maintenant. Renvoie le nombre de reconductions appliquées.
create or replace function public.renew_overdue_rentals(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rentals;
  v_count integer := 0;
  v_end timestamptz;
  v_steps integer;
  v_plate text;
begin
  for r in
    select * from public.rentals
    where kind = 'rental' and status = 'active' and returned_at is null and tacit_renewal
      and planned_return_at < p_now
    order by planned_return_at
  loop
    v_end := r.planned_return_at;
    v_steps := 0;
    while v_end < p_now and v_steps < 400 loop
      v_end := v_end + public.rental_renewal_step(r.rate_period);
      v_steps := v_steps + 1;
    end loop;
    select plate into v_plate from public.fleet_vehicles where id = r.fleet_vehicle_id;

    begin
      perform set_config('rts.rental_transition', 'on', true);
      update public.rentals
         set planned_return_at = v_end,
             periods = periods + v_steps,
             renewals = renewals + v_steps
       where id = r.id;
      perform set_config('rts.rental_transition', '', true);
      v_count := v_count + v_steps;

      insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
      select role, 'rental_renewed',
             'Location ' || r.number || ' reconduite',
             v_plate || ' non rendu : contrat prolongé de ' || public.rental_unit_label(r.rate_period)
               || case when v_steps > 1 then ' (' || v_steps || ' fois)' else '' end
               || ', fin le ' || to_char(v_end at time zone 'Europe/Paris', 'DD/MM/YYYY à HH24hMI'),
             '/location/contrats/' || r.id, 'rental_renewed:' || r.id || ':' || v_end || ':' || role
      from unnest(array['direction', 'reception']::public.app_role[]) as role
      on conflict (dedupe_key) do nothing;
    exception when exclusion_violation then
      perform set_config('rts.rental_transition', '', true);
      insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
      select role, 'rental_renewal_blocked',
             'Location ' || r.number || ' : véhicule non rendu',
             v_plate || ' devait être rendu le ' || to_char(r.planned_return_at at time zone 'Europe/Paris', 'DD/MM/YYYY')
               || ' : reconduction impossible, le véhicule est réservé ensuite.',
             '/location/contrats/' || r.id, 'rental_renewal_blocked:' || r.id || ':' || r.planned_return_at || ':' || role
      from unnest(array['direction', 'reception']::public.app_role[]) as role
      on conflict (dedupe_key) do nothing;
    end;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- E-mail de fin de contrat
-- ---------------------------------------------------------------------------

alter table public.auto_mail_log drop constraint auto_mail_log_kind_check;
alter table public.auto_mail_log
  add constraint auto_mail_log_kind_check check (kind in (
    'appointment_reminder', 'appointment_confirmed', 'ct', 'tailgate', 'antipollution', 'maintenance',
    'rental_end'));
alter table public.auto_mail_log
  add column rental_id uuid references public.rentals (id) on delete set null;

-- Locations en cours dont la fin approche (12 h avant pour un contrat au jour, 48 h sinon),
-- de 8 h à 19 h à Paris. Une clé par date de fin : chaque reconduction relance un e-mail.
create or replace function public.prepare_rental_mails(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour integer := extract(hour from p_now at time zone 'Europe/Paris');
begin
  if v_hour not between 8 and 18 then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', 'rental_end:' || r.id || ':' || r.planned_return_at,
             'kind', 'rental_end', 'to', c.email, 'client_id', c.id, 'rental_id', r.id,
             'client_name', c.name, 'plate', v.plate, 'number', r.number,
             'date', (r.planned_return_at at time zone 'Europe/Paris')::date,
             'time', to_char(r.planned_return_at at time zone 'Europe/Paris', 'HH24:MI'),
             'tacit_renewal', r.tacit_renewal,
             'unit', public.rental_unit_label(r.rate_period)))
    from public.rentals r
    join public.clients c on c.id = r.client_id
    join public.fleet_vehicles v on v.id = r.fleet_vehicle_id
    where r.kind = 'rental' and r.status = 'active' and r.returned_at is null
      and r.planned_return_at > p_now
      and r.planned_return_at <= p_now + case when r.rate_period in ('day', 'weekend') then interval '12 hours'
                                              else interval '48 hours' end
      and nullif(btrim(c.email), '') is not null
      and not exists (select 1 from public.auto_mail_log l
                      where l.key = 'rental_end:' || r.id || ':' || r.planned_return_at
                        and (l.sent_at is not null or l.attempts >= 3))
  ), '[]'::jsonb);
end;
$$;

-- Résultat d'un envoi automatique (la location est gardée dans le journal).
create or replace function public.record_auto_mail(
  p_key text, p_kind text, p_recipient text, p_client_id uuid, p_vehicle_id uuid, p_appointment_id uuid,
  p_provider_message_id text, p_error text, p_rental_id uuid default null
)
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
end;
$$;
drop function public.record_auto_mail(text, text, text, uuid, uuid, uuid, text, text);

-- Tâche planifiée des e-mails : reconductions d'abord (la fin de contrat suit), puis l'envoi.
create or replace function public.run_auto_mails()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.renew_overdue_rentals();
  if not exists (select 1 from public.app_settings where mail_send_enabled and auto_mails_enabled) then
    return null;
  end if;
  return public.invoke_edge_function('auto-mails');
end;
$$;

revoke execute on function
  public.renew_overdue_rentals(timestamptz),
  public.prepare_rental_mails(timestamptz),
  public.record_auto_mail(text, text, text, uuid, uuid, uuid, text, text, uuid),
  public.run_auto_mails()
from public, anon, authenticated;
grant execute on function public.prepare_rental_mails(timestamptz),
  public.record_auto_mail(text, text, text, uuid, uuid, uuid, text, text, uuid) to service_role;
revoke execute on function public.rental_renewal_step(text), public.rental_unit_label(text) from public, anon;
grant execute on function public.rental_renewal_step(text), public.rental_unit_label(text) to authenticated;
