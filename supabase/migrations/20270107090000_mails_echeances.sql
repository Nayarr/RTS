-- =============================================================================
-- Mails reçus : nouvelles dates de contrôle technique ou de hayon proposées pour la fiche véhicule
--
-- Demande du client : quand un client confirme par mail le renouvellement d'un contrôle technique
-- ou d'un contrôle hayon avec des dates bonnes et cohérentes, l'agent propose de mettre à jour la
-- fiche du véhicule. Le tri du mail relève les dates ; la base ne garde que celles qui tiennent
-- (véhicule connu, du client qui écrit, date à venir et plus tardive que celle de la fiche) ; le
-- bureau les applique ou les écarte. Rien ne change sans son accord.
-- =============================================================================

alter table public.inbox_emails
  add column deadline_updates jsonb not null default '[]'::jsonb,
  add column deadline_updates_status text not null default 'none'
    check (deadline_updates_status in ('none', 'proposed', 'applied', 'dismissed')),
  add column deadline_updates_decided_at timestamptz,
  add column deadline_updates_decided_by uuid references public.profiles (id) on delete set null;
comment on column public.inbox_emails.deadline_updates is
  'Dates de contrôle proposées d''après le mail : [{vehicle_id, plate, kind (ct, tailgate), date, current}].';

-- ---------------------------------------------------------------------------
-- Dates relevées par le tri (mail-inbox, clé de service) : seules les cohérentes sont gardées
-- ---------------------------------------------------------------------------
create function public.propose_inbox_deadline_updates(p_mail_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mail public.inbox_emails;
  v_item jsonb;
  v_vehicle public.vehicles;
  v_kind text;
  v_date date;
  v_current date;
  v_today date := public.paris_date(now());
  v_updates jsonb := '[]'::jsonb;
begin
  select * into v_mail from public.inbox_emails where id = p_mail_id;
  if not found or v_mail.deadline_updates_status <> 'none' then
    return 0;
  end if;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) limit 20 loop
    v_kind := case v_item ->> 'controle' when 'ct' then 'ct' when 'hayon' then 'tailgate' end;
    begin
      v_date := (v_item ->> 'date')::date;
    exception when others then
      v_date := null;
    end;
    continue when v_kind is null or v_date is null;
    select * into v_vehicle from public.vehicles
     where plate_key = public.normalize_key(coalesce(v_item ->> 'immatriculation', ''))
       and archived_at is null
     limit 1;
    -- Véhicule connu, du client qui écrit (quand l'expéditeur est reconnu)
    continue when not found or (v_mail.client_id is not null and v_vehicle.client_id is distinct from v_mail.client_id);
    if v_kind = 'tailgate' then
      -- Hayon : au mois, comme l'étiquette ; un an au plus
      v_date := date_trunc('month', v_date)::date;
      v_current := v_vehicle.tailgate_due_date;
      continue when v_date < date_trunc('month', v_today)::date or v_date > v_today + interval '13 months';
    else
      -- Contrôle technique : à venir, deux ans au plus
      v_current := v_vehicle.ct_due_date;
      continue when v_date <= v_today or v_date > v_today + interval '25 months';
    end if;
    -- Plus tardive que la date de la fiche (sinon rien à mettre à jour)
    continue when v_current is not null and v_date <= v_current;
    continue when v_updates @> jsonb_build_array(jsonb_build_object('vehicle_id', v_vehicle.id, 'kind', v_kind));
    v_updates := v_updates || jsonb_build_object(
      'vehicle_id', v_vehicle.id, 'plate', v_vehicle.plate, 'kind', v_kind, 'date', v_date, 'current', v_current);
  end loop;
  if jsonb_array_length(v_updates) = 0 then
    return 0;
  end if;
  update public.inbox_emails
     set deadline_updates = v_updates, deadline_updates_status = 'proposed'
   where id = p_mail_id;
  return jsonb_array_length(v_updates);
end;
$$;
revoke execute on function public.propose_inbox_deadline_updates(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.propose_inbox_deadline_updates(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Bureau : dates appliquées aux fiches des véhicules, ou écartées
-- ---------------------------------------------------------------------------
create function public.decide_inbox_deadline_updates(p_mail_id uuid, p_apply boolean)
returns public.inbox_emails
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mail public.inbox_emails;
  v_item jsonb;
begin
  perform public.assert_office();
  select * into v_mail from public.inbox_emails where id = p_mail_id for update;
  if not found then
    raise exception 'Mail introuvable' using errcode = 'P0002';
  end if;
  if v_mail.deadline_updates_status <> 'proposed' then
    raise exception 'Mise à jour déjà traitée' using errcode = 'P0001';
  end if;
  if p_apply then
    for v_item in select * from jsonb_array_elements(v_mail.deadline_updates) loop
      if v_item ->> 'kind' = 'tailgate' then
        update public.vehicles set tailgate_due_date = (v_item ->> 'date')::date
         where id = (v_item ->> 'vehicle_id')::uuid;
      else
        update public.vehicles set ct_due_date = (v_item ->> 'date')::date
         where id = (v_item ->> 'vehicle_id')::uuid;
      end if;
    end loop;
  end if;
  update public.inbox_emails
     set deadline_updates_status = case when p_apply then 'applied' else 'dismissed' end,
         deadline_updates_decided_at = now(),
         deadline_updates_decided_by = auth.uid()
   where id = p_mail_id
  returning * into v_mail;
  return v_mail;
end;
$$;
revoke execute on function public.decide_inbox_deadline_updates(uuid, boolean) from public, anon;
grant execute on function public.decide_inbox_deadline_updates(uuid, boolean) to authenticated;
