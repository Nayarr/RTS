-- Agent Direction : actions préparées puis validées (retours du client)
--   L'agent peut préparer trois actions : prendre un rendez-vous, ajouter un travail à faire sur un
--   OR, assigner un technicien à un OR. Il ne les exécute jamais : chaque action préparée est
--   affichée à la direction, qui la valide (clic ou « vas-y » à la voix, 5 s pour annuler) ;
--   l'exécution passe par execute_agent_action, avec les droits de la direction. Une action non
--   validée expire au bout de 30 minutes.

create table public.agent_actions (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  conversation_id  uuid references public.agent_conversations (id) on delete cascade,
  kind             text not null check (kind in ('appointment', 'ro_work', 'assign_technician')),
  payload          jsonb not null check (jsonb_typeof(payload) = 'object'),
  summary          text not null check (char_length(summary) between 1 and 500),
  status           text not null default 'proposed' check (status in ('proposed', 'done', 'cancelled', 'failed')),
  result           jsonb,
  error            text,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz
);
create index agent_actions_profile_idx on public.agent_actions (profile_id, created_at desc);
comment on table public.agent_actions is
  'Actions préparées par l''Agent Direction, exécutées seulement après validation de la direction.';

alter table public.agent_actions enable row level security;
create policy agent_actions_select on public.agent_actions for select to authenticated
  using (public.is_direction() and profile_id = auth.uid());
-- L'agent prépare l'action avec les droits de la personne connectée ; elle reste « proposée »
create policy agent_actions_insert on public.agent_actions for insert to authenticated
  with check (public.is_direction() and profile_id = auth.uid() and status = 'proposed'
              and result is null and error is null and decided_at is null);
revoke all on public.agent_actions from public, anon;
grant select, insert on public.agent_actions to authenticated;

-- Annulation d'une action préparée.
create or replace function public.cancel_agent_action(p_action_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_direction() then
    raise exception 'Réservé à la direction' using errcode = '42501';
  end if;
  update public.agent_actions set status = 'cancelled', decided_at = now()
   where id = p_action_id and profile_id = auth.uid() and status = 'proposed';
end;
$$;

-- Exécution d'une action validée par la direction. Renvoie l'action à jour (statut, résultat ou erreur).
create or replace function public.execute_agent_action(p_action_id uuid)
returns public.agent_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.agent_actions;
  v_payload jsonb;
  v_result jsonb;
  v_ro public.repair_orders;
  v_appt public.appointments;
  v_line_id uuid;
begin
  if not public.is_direction() then
    raise exception 'Réservé à la direction' using errcode = '42501';
  end if;
  select * into v_action from public.agent_actions
   where id = p_action_id and profile_id = auth.uid() for update;
  if not found then
    raise exception 'Action introuvable' using errcode = 'P0002';
  end if;
  if v_action.status <> 'proposed' then
    raise exception 'Action déjà traitée' using errcode = 'P0001';
  end if;
  if v_action.created_at < now() - interval '30 minutes' then
    update public.agent_actions set status = 'cancelled', decided_at = now(), error = 'Expirée'
     where id = p_action_id returning * into v_action;
    return v_action;
  end if;
  v_payload := v_action.payload;

  begin
    if v_action.kind = 'appointment' then
      v_appt := public.save_appointment(
        p_client_name => coalesce(v_payload ->> 'client_name', ''),
        p_plate => coalesce(v_payload ->> 'plate', ''),
        p_vehicle_type => coalesce(v_payload ->> 'vehicle_type', 'pl')::public.vehicle_type,
        p_scheduled_date => (v_payload ->> 'date')::date,
        p_start_time => (v_payload ->> 'start_time')::time,
        p_end_time => (v_payload ->> 'end_time')::time,
        p_reason => v_payload ->> 'reason',
        p_technician_id => (v_payload ->> 'technician_id')::uuid
      );
      v_result := jsonb_build_object('appointment_id', v_appt.id, 'link', '/rendez-vous');

    elsif v_action.kind = 'ro_work' then
      select * into v_ro from public.repair_orders where id = (v_payload ->> 'repair_order_id')::uuid for update;
      if not found then
        raise exception 'OR introuvable' using errcode = 'P0002';
      end if;
      if v_ro.status in ('to_invoice', 'invoiced') then
        raise exception 'OR % déjà terminé : travail non ajouté', v_ro.number using errcode = 'P0001';
      end if;
      insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours)
      values (v_ro.id, 'planned',
              coalesce((select max(position) + 1 from public.ro_lines where repair_order_id = v_ro.id), 0),
              'labor', v_payload ->> 'description', (v_payload ->> 'estimated_hours')::numeric)
      returning id into v_line_id;
      insert into public.ro_events (repair_order_id, label, actor_id)
      values (v_ro.id, 'Travail ajouté par l''Agent Direction : ' || (v_payload ->> 'description'), auth.uid());
      v_result := jsonb_build_object('repair_order_id', v_ro.id, 'line_id', v_line_id, 'link', '/or/' || v_ro.id);

    else -- assign_technician
      select * into v_ro from public.repair_orders where id = (v_payload ->> 'repair_order_id')::uuid for update;
      if not found then
        raise exception 'OR introuvable' using errcode = 'P0002';
      end if;
      if v_ro.status in ('to_invoice', 'invoiced') then
        raise exception 'OR % déjà terminé : technicien non changé', v_ro.number using errcode = 'P0001';
      end if;
      update public.repair_orders set technician_id = (v_payload ->> 'technician_id')::uuid where id = v_ro.id;
      insert into public.ro_events (repair_order_id, label, actor_id)
      values (v_ro.id, 'Technicien assigné par l''Agent Direction : '
                       || coalesce((select display_name from public.technicians
                                    where id = (v_payload ->> 'technician_id')::uuid), '?'), auth.uid());
      v_result := jsonb_build_object('repair_order_id', v_ro.id, 'link', '/or/' || v_ro.id);
    end if;

    update public.agent_actions set status = 'done', decided_at = now(), result = v_result
     where id = p_action_id returning * into v_action;
  exception when others then
    -- Action refusée par les règles de l'appli : notée, la direction voit pourquoi
    update public.agent_actions set status = 'failed', decided_at = now(), error = left(sqlerrm, 300)
     where id = p_action_id returning * into v_action;
  end;
  return v_action;
end;
$$;

revoke execute on function public.cancel_agent_action(uuid), public.execute_agent_action(uuid) from public, anon;
grant execute on function public.cancel_agent_action(uuid), public.execute_agent_action(uuid) to authenticated;
