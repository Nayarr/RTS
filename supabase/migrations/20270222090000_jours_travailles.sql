-- Jours travaillés par compte, badgeage facultatif, alternants une semaine sur deux.
--   - technicians.work_days : jours de la semaine travaillés (ISO, 1 = lundi … 6 = samedi), lundi à samedi
--     par défaut. Ex. : Nicolas ne travaille pas le samedi.
--   - technicians.clock_required : le compte badge à la borne (sinon : ni absence, ni retard, ni alerte).
--   - technicians.alternance : 'A' ou 'B' pour un alternant présent une semaine sur deux ; la semaine A
--     est celle du lundi de référence des repos (Réglages), comme pour les lundis de repos.
--   - technician_schedule_exceptions : présence en plus d'une période (alternant pendant les vacances…).
-- Une seule règle, technician_scheduled(technicien, jour), sert aux alertes de pointage, à la charge de
-- l'atelier et aux absences de la page Pointages et du relevé d'heures.

alter table public.technicians
  add column work_days smallint[] not null default '{1,2,3,4,5,6}'::smallint[]
    check (work_days <@ '{1,2,3,4,5,6}'::smallint[]),
  add column clock_required boolean not null default true,
  add column alternance text check (alternance in ('A', 'B'));
comment on column public.technicians.work_days is
  'Jours travaillés (ISO : 1 = lundi … 6 = samedi) ; un jour non coché n''est ni une absence ni un retard.';
comment on column public.technicians.clock_required is
  'Le compte badge à la borne ; sinon pas d''absence, de retard ni d''alerte de pointage.';
comment on column public.technicians.alternance is
  'Alternant : présent seulement les semaines A ou B (semaine A = celle du lundi de référence des repos).';

create table public.technician_schedule_exceptions (
  id             uuid primary key default gen_random_uuid(),
  technician_id  uuid not null references public.technicians (id) on delete cascade,
  starts_on      date not null,
  ends_on        date not null,
  note           text check (char_length(note) <= 200),
  created_by     uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint technician_schedule_exceptions_dates_check check (ends_on >= starts_on)
);
comment on table public.technician_schedule_exceptions is
  'Présence en plus d''une période hors des jours habituels (alternant pendant les vacances…).';
create index technician_schedule_exceptions_technician_idx
  on public.technician_schedule_exceptions (technician_id, starts_on);

alter table public.technician_schedule_exceptions enable row level security;
create policy technician_schedule_exceptions_select on public.technician_schedule_exceptions
  for select to authenticated using (public.current_app_role() is not null);
create policy technician_schedule_exceptions_write on public.technician_schedule_exceptions
  for all to authenticated using (public.is_direction()) with check (public.is_direction());
revoke all on public.technician_schedule_exceptions from anon;
grant select, insert, update, delete on public.technician_schedule_exceptions to authenticated;

-- ---------------------------------------------------------------------------
-- Jour travaillé d'une fiche (hors congés, comptés à part)
-- ---------------------------------------------------------------------------
create function public.technician_scheduled(p_technician_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Atelier fermé : le dimanche, et le samedi réglé à 0 h
    when extract(isodow from p_day) = 7
      or (extract(isodow from p_day) = 6 and coalesce(s.saturday_hours, 0) = 0) then false
    -- Présence en plus (alternant pendant les vacances…)
    when exists (select 1 from public.technician_schedule_exceptions x
                 where x.technician_id = t.id and p_day between x.starts_on and x.ends_on) then true
    when not (extract(isodow from p_day)::smallint = any (t.work_days)) then false
    -- Alternant : semaine A = semaine du lundi de référence, puis une sur deux
    when t.alternance is not null
      and t.alternance <> case when mod(mod(floor((p_day - coalesce(s.rest_reference_monday, date '2024-01-01'))
                                                   / 7.0)::integer, 2) + 2, 2) = 0
                               then 'A' else 'B' end then false
    -- Lundi de repos : un lundi sur deux, groupe A à partir du lundi de référence
    when extract(isodow from p_day) = 1 and t.rest_group is not null and s.rest_reference_monday is not null
      and t.rest_group = case when (((p_day - s.rest_reference_monday) / 7) % 2 + 2) % 2 = 0
                              then 'A'::public.rest_group else 'B'::public.rest_group end then false
    else true
  end
  from public.technicians t
  cross join (select * from public.app_settings limit 1) s
  where t.id = p_technician_id;
$$;
revoke execute on function public.technician_scheduled(uuid, date) from public, anon;
grant execute on function public.technician_scheduled(uuid, date) to authenticated;

-- Jours travaillés de chaque fiche active sur une période (page Pointages, relevé d'heures), à partir de
-- la création de la fiche
create function public.technician_schedule(p_from date, p_to date)
returns table (technician_id uuid, day date, scheduled boolean, clock_required boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_office() or public.is_accountant()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  return query
  -- Avant la création de la fiche : pas encore dans l'équipe, donc pas d'absence
  select t.id, d::date,
         d::date >= (t.created_at at time zone 'Europe/Paris')::date
           and public.technician_scheduled(t.id, d::date),
         t.clock_required
  from public.technicians t
  cross join generate_series(p_from, p_to, interval '1 day') d
  where t.is_active;
end;
$$;
revoke execute on function public.technician_schedule(date, date) from public, anon;
grant execute on function public.technician_schedule(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Alertes de pointage : rien un jour non travaillé, rien pour un compte qui ne badge pas
-- ---------------------------------------------------------------------------
create or replace function public.attendance_day_off(p_technician_id uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not t.clock_required
      or not public.technician_scheduled(t.id, p_day)
      or exists (select 1 from public.leave_requests l
                 where l.technician_id = p_technician_id and l.status = 'approved' and not l.is_deleted
                   and l.start_time is null and p_day between l.starts_on and l.ends_on)
  from public.technicians t
  where t.id = p_technician_id;
$$;

-- ---------------------------------------------------------------------------
-- Charge de l'atelier : un jour non travaillé n'est pas une heure disponible (« Absent · repos »)
-- ---------------------------------------------------------------------------
do $migration$
declare
  v_def text := pg_get_functiondef('public.workshop_workload(date,date)'::regprocedure);
  v_old text := $old$           (d.dow = 1 and t.rest_group is not null and v_settings.rest_reference_monday is not null
             and t.rest_group = case when (((d.day - v_settings.rest_reference_monday) / 7) % 2 + 2) % 2 = 0
                                     then 'A'::public.rest_group else 'B'::public.rest_group end) as resting,$old$;
  v_new text := $new$           -- (jours travaillés du compte, alternance, présences en plus : technician_scheduled)
           (d.dow between 1 and 6 and not public.technician_scheduled(t.id, d.day)) as resting,$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans workshop_workload : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
