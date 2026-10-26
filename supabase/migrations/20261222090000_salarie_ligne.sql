-- =============================================================================
-- Qui a fait chaque ligne : technicien d'une ligne d'OR, salarié d'une ligne de facture
--
-- Retour du client : sur un OR à deux tâches, le mécano 1 fait la A, l'OR passe au mécano 2 qui
-- fait la B. Le badgeage est déjà au nom de chacun, mais le temps déclaré de l'OR partait en
-- entier au technicien assigné à la fin, et un badgeage resté ouvert bloquait le mécano 2.
-- - Ligne d'OR : le technicien qui saisit le temps réel d'une tâche (ou qui l'ajoute) y est noté ;
--   charge de travail et détail des heures comptés ligne par ligne.
-- - Changement de technicien sur l'OR : le badgeage en cours de l'ancien est arrêté.
-- - Ligne de facture : salarié (technicien ou bureau), réservé à la direction, jamais sur la
--   facture du client (PDF, lien en ligne) ; prérempli depuis l'OR, modifiable, chaque changement
--   gardé dans l'historique de la facture.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Technicien d'une ligne d'OR
-- ---------------------------------------------------------------------------
alter table public.ro_lines add column technician_id uuid references public.technicians (id) on delete set null;
comment on column public.ro_lines.technician_id is
  'Technicien qui a fait la tâche (temps réel saisi ou tâche ajoutée par lui) ; sinon celui de l''OR.';
create index ro_lines_technician_idx on public.ro_lines (technician_id) where technician_id is not null;

select set_config('rts.system', 'on', true);
update public.ro_lines l
   set technician_id = r.technician_id
  from public.repair_orders r
 where r.id = l.repair_order_id and l.kind = 'done' and l.estimated_hours is not null and r.technician_id is not null;
select set_config('rts.system', '', true);

create function public.ro_lines_set_performer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tech uuid := public.current_technician_id();
begin
  if v_tech is not null and new.kind = 'done'
     and (tg_op = 'INSERT' or new.estimated_hours is distinct from old.estimated_hours) then
    new.technician_id := v_tech;
  end if;
  return new;
end;
$$;
-- Après le garde du technicien (ordre alphabétique) : il ne voit pas ce champ changer
revoke execute on function public.ro_lines_set_performer() from public, anon;
create trigger ro_lines_set_performer
  before insert or update on public.ro_lines
  for each row execute function public.ro_lines_set_performer();

-- ---------------------------------------------------------------------------
-- OR réassigné : le badgeage en cours de l'ancien technicien s'arrête
-- ---------------------------------------------------------------------------
create function public.repair_orders_stop_previous_timer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.technician_id is distinct from old.technician_id then
    perform set_config('rts.system', 'on', true);
    update public.time_entries
       set ended_at = now(), stopped_by = auth.uid()
     where repair_order_id = new.id and ended_at is null
       and technician_id is distinct from new.technician_id;
    perform set_config('rts.system', '', true);
  end if;
  return null;
end;
$$;
revoke execute on function public.repair_orders_stop_previous_timer() from public, anon;
create trigger repair_orders_stop_previous_timer
  after update of technician_id on public.repair_orders
  for each row execute function public.repair_orders_stop_previous_timer();

-- ---------------------------------------------------------------------------
-- Salarié d'une ligne de facture (direction seulement)
-- ---------------------------------------------------------------------------
create table public.invoice_line_employees (
  invoice_line_id uuid primary key references public.invoice_lines (id) on delete cascade,
  technician_id   uuid references public.technicians (id) on delete set null,
  profile_id      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now(),
  constraint invoice_line_employees_one check (num_nonnulls(technician_id, profile_id) <= 1)
);
comment on table public.invoice_line_employees is
  'Salarié d''une ligne de facture (technicien ou bureau) : interne, réservé à la direction, jamais sur la facture du client.';

create table public.invoice_line_employee_changes (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices (id) on delete cascade,
  invoice_line_id  uuid references public.invoice_lines (id) on delete set null,
  line_description text not null,
  old_name         text,
  new_name         text,
  changed_by       uuid references public.profiles (id) on delete set null,
  changed_at       timestamptz not null default now()
);
create index invoice_line_employee_changes_invoice_idx on public.invoice_line_employee_changes (invoice_id, changed_at);
comment on table public.invoice_line_employee_changes is 'Historique des changements de salarié sur les lignes d''une facture.';

alter table public.invoice_line_employees enable row level security;
alter table public.invoice_line_employee_changes enable row level security;
create policy invoice_line_employees_select on public.invoice_line_employees for select to authenticated
  using (public.is_direction());
create policy invoice_line_employee_changes_select on public.invoice_line_employee_changes for select to authenticated
  using (public.is_direction());
revoke all on public.invoice_line_employees, public.invoice_line_employee_changes from anon;
grant select on public.invoice_line_employees, public.invoice_line_employee_changes to authenticated;

-- Ligne venue d'un OR : le technicien de la ligne, sinon celui de l'OR
create function public.invoice_lines_prefill_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tech uuid;
begin
  select coalesce((select l.technician_id from public.ro_lines l where l.id = new.source_ro_line_id),
                  (select r.technician_id from public.repair_orders r where r.id = new.repair_order_id))
    into v_tech;
  if v_tech is not null then
    insert into public.invoice_line_employees (invoice_line_id, technician_id)
    values (new.id, v_tech)
    on conflict (invoice_line_id) do nothing;
  end if;
  return null;
end;
$$;
revoke execute on function public.invoice_lines_prefill_employee() from public, anon;
create trigger invoice_lines_prefill_employee
  after insert on public.invoice_lines
  for each row execute function public.invoice_lines_prefill_employee();

-- Lignes des factures existantes venues d'un OR
insert into public.invoice_line_employees (invoice_line_id, technician_id)
select il.id, coalesce(l.technician_id, r.technician_id)
from public.invoice_lines il
left join public.ro_lines l on l.id = il.source_ro_line_id
left join public.repair_orders r on r.id = il.repair_order_id
where coalesce(l.technician_id, r.technician_id) is not null
on conflict (invoice_line_id) do nothing;

-- Nom d'un salarié (technicien ou compte du bureau)
create function public.employee_name(p_technician_id uuid, p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select display_name from public.technicians where id = p_technician_id),
                  (select full_name from public.profiles where id = p_profile_id));
$$;
revoke execute on function public.employee_name(uuid, uuid) from public, anon;
grant execute on function public.employee_name(uuid, uuid) to authenticated;

-- Changement de salarié (direction), même sur une facture émise : la facture du client ne change pas
create function public.set_invoice_line_employee(p_line_id uuid, p_technician_id uuid default null,
                                                 p_profile_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.invoice_lines;
  v_old public.invoice_line_employees;
  v_old_name text;
  v_new_name text;
begin
  perform public.assert_direction();
  if p_technician_id is not null and p_profile_id is not null then
    raise exception 'Un seul salarié par ligne' using errcode = '22023';
  end if;
  select * into v_line from public.invoice_lines where id = p_line_id;
  if not found then
    raise exception 'Ligne introuvable' using errcode = 'P0002';
  end if;
  if p_profile_id is not null
     and not exists (select 1 from public.profiles where id = p_profile_id and role in ('direction', 'reception')) then
    raise exception 'Salarié inconnu' using errcode = '22023';
  end if;
  if p_technician_id is not null and not exists (select 1 from public.technicians where id = p_technician_id) then
    raise exception 'Salarié inconnu' using errcode = '22023';
  end if;

  select * into v_old from public.invoice_line_employees where invoice_line_id = p_line_id;
  v_old_name := public.employee_name(v_old.technician_id, v_old.profile_id);
  v_new_name := public.employee_name(p_technician_id, p_profile_id);
  if v_old_name is not distinct from v_new_name
     and v_old.technician_id is not distinct from p_technician_id
     and v_old.profile_id is not distinct from p_profile_id then
    return;
  end if;

  insert into public.invoice_line_employees (invoice_line_id, technician_id, profile_id, updated_at)
  values (p_line_id, p_technician_id, p_profile_id, now())
  on conflict (invoice_line_id) do update
    set technician_id = excluded.technician_id, profile_id = excluded.profile_id, updated_at = now();
  insert into public.invoice_line_employee_changes (invoice_id, invoice_line_id, line_description, old_name, new_name,
                                                    changed_by)
  values (v_line.invoice_id, p_line_id, split_part(v_line.description, E'\n', 1), v_old_name, v_new_name, auth.uid());
end;
$$;
revoke execute on function public.set_invoice_line_employee(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_invoice_line_employee(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Charge de travail : temps déclaré au technicien de chaque ligne
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workshop_workload(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_settings public.app_settings;
  v_today date := public.paris_date(now());
  v_technicians jsonb;
  v_to_plan jsonb;
begin
  perform public.assert_office();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  select * into v_settings from public.app_settings;

  with days as (
    select d::date as day, extract(isodow from d)::int as dow
    from generate_series(p_from, p_to, interval '1 day') d
  ),
  techs as (
    select t.* from public.technicians t where t.is_active and not t.exclude_from_planning
  ),
  presence as (
    select t.id as technician_id, d.day, d.dow,
           -- Lundi de repos : un lundi sur deux, groupe A à partir du lundi de référence
           (d.dow = 1 and t.rest_group is not null and v_settings.rest_reference_monday is not null
             and t.rest_group = case when (((d.day - v_settings.rest_reference_monday) / 7) % 2 + 2) % 2 = 0
                                     then 'A'::public.rest_group else 'B'::public.rest_group end) as resting,
           exists (select 1 from public.leave_requests l
                   where l.technician_id = t.id and l.status = 'approved' and not l.is_deleted
                     and l.start_time is null
                     and d.day between l.starts_on and l.ends_on) as on_leave,
           -- Absence de quelques heures ce jour-là (demi-journée, rendez-vous…)
           coalesce((select sum(extract(epoch from l.end_time - l.start_time) / 3600)
                     from public.leave_requests l
                     where l.technician_id = t.id and l.status = 'approved' and not l.is_deleted
                       and l.start_time is not null and l.starts_on = d.day), 0) as partial_hours
    from techs t cross join days d
  ),
  available as (
    select technician_id,
           sum(case when dow between 1 and 5 and not resting and not on_leave
                    then greatest(0, case when dow = 5 then v_settings.friday_hours else v_settings.daily_hours end
                                     - partial_hours)
                    else 0 end) as hours,
           bool_and(on_leave or dow > 5) and bool_or(on_leave) as all_leave,
           bool_and(dow > 5) as closed
    from presence group by technician_id
  ),
  declared as (
    select coalesce(l.technician_id, r.technician_id) as technician_id, sum(l.estimated_hours) as hours,
           count(distinct r.id) as orders
    from public.ro_lines l
    join public.repair_orders r on r.id = l.repair_order_id
    where l.kind = 'done' and coalesce(l.estimated_hours, 0) > 0
      and coalesce(l.technician_id, r.technician_id) is not null
      and public.paris_date(l.created_at) between p_from and p_to
    group by coalesce(l.technician_id, r.technician_id)
  ),
  planned as (
    select r.technician_id, count(*) as orders, sum(public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end)) as hours
    from public.repair_orders r
    where r.technician_id is not null and r.planned_date between p_from and p_to
    group by r.technician_id
  ),
  -- Présence badgée à la borne : paires arrivée / départ, plus la présence en cours aujourd'hui.
  clocked as (
    select t.id as technician_id,
           coalesce((select sum(a.worked_seconds) from public.v_daily_attendance a
                     where a.technician_id = t.id and a.work_date between p_from and p_to), 0)
           + coalesce((select extract(epoch from now() - e.occurred_at)
                       from (select ce.occurred_at, ce.event_type from public.clock_events ce
                             where ce.technician_id = t.id and ce.work_date = v_today
                             order by ce.occurred_at desc limit 1) e
                       where e.event_type = 'in' and v_today between p_from and p_to), 0) as seconds
    from techs t
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'technician_id', t.id,
           'name', t.display_name,
           'color', t.color,
           'available_hours', coalesce(a.hours, 0),
           'declared_hours', coalesce(dc.hours, 0),
           'worked_orders', coalesce(dc.orders, 0),
           'planned_hours', coalesce(p.hours, 0),
           'planned_orders', coalesce(p.orders, 0),
           'clocked_hours', round(coalesce(c.seconds, 0) / 3600.0, 2),
           'absence', case when coalesce(a.hours, 0) > 0 then null
                           when a.closed then 'closed'
                           when a.all_leave then 'leave' else 'rest' end)
         order by t.sort_order, t.display_name), '[]'::jsonb)
    into v_technicians
  from techs t
  left join available a on a.technician_id = t.id
  left join declared dc on dc.technician_id = t.id
  left join planned p on p.technician_id = t.id
  left join clocked c on c.technician_id = t.id;

  select jsonb_build_object('orders', count(*), 'hours', coalesce(sum(public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end)), 0))
    into v_to_plan
  from public.repair_orders r
  where r.status in ('assigned', 'in_progress', 'quote_pending')
    and (r.planned_date is null or r.technician_id is null or r.planned_date < v_today);

  return jsonb_build_object('from', p_from, 'to', p_to, 'technicians', v_technicians, 'to_plan', v_to_plan);
end;
$$;

CREATE OR REPLACE FUNCTION public.workshop_workload_detail(p_technician_id uuid, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $$
begin
  perform public.assert_office();
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'declared', coalesce((
      select jsonb_agg(jsonb_build_object(
               'repair_order_id', r.id, 'number', r.number, 'plate', v.plate,
               'day', public.paris_date(l.created_at), 'description', split_part(l.description, E'\n', 1),
               'hours', l.estimated_hours)
             order by l.created_at, r.number)
      from public.ro_lines l
      join public.repair_orders r on r.id = l.repair_order_id
      left join public.vehicles v on v.id = r.vehicle_id
      where coalesce(l.technician_id, r.technician_id) = p_technician_id and l.kind = 'done'
        and coalesce(l.estimated_hours, 0) > 0
        and public.paris_date(l.created_at) between p_from and p_to), '[]'::jsonb),
    'planned', coalesce((
      select jsonb_agg(jsonb_build_object(
               'repair_order_id', r.id, 'number', r.number, 'plate', v.plate, 'day', r.planned_date,
               'hours', public.repair_order_planned_hours(r.id, r.planned_start, r.planned_end))
             order by r.planned_date, r.planned_start nulls last, r.number)
      from public.repair_orders r
      left join public.vehicles v on v.id = r.vehicle_id
      where r.technician_id = p_technician_id and r.planned_date between p_from and p_to), '[]'::jsonb));
end;
$$;
