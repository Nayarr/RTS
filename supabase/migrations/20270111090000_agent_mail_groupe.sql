-- Agent Direction : mail groupé au même texte pour tous les clients ou une partie (send_mailing).
-- Une seule action à valider : objet, texte et destinataires (un mail chacun, envoyés par mail-send).

alter table public.agent_actions drop constraint agent_actions_kind_check;
alter table public.agent_actions add constraint agent_actions_kind_check check (kind in (
  'appointment', 'ro_work', 'assign_technician', 'send_mail', 'send_mailing', 'vehicle_deadline',
  'schedule_order', 'appointment_change', 'order_to_invoice', 'invoice_draft'));

CREATE OR REPLACE FUNCTION public.execute_agent_action(p_action_id uuid)
 RETURNS agent_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action public.agent_actions;
  v_payload jsonb;
  v_result jsonb;
  v_ro public.repair_orders;
  v_appt public.appointments;
  v_line_id uuid;
  v_vehicle public.vehicles;
  v_date date;
  v_invoice_id uuid;
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
  -- Un mail préparé (seul ou groupé) part par l'envoi des e-mails (fonction mail-send), jamais d'ici
  if v_action.kind in ('send_mail', 'send_mailing') then
    raise exception 'Un mail préparé s''envoie par l''envoi des e-mails de l''appli' using errcode = 'P0001';
  end if;

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

    elsif v_action.kind = 'assign_technician' then
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

    elsif v_action.kind = 'vehicle_deadline' then
      select * into v_vehicle from public.vehicles where id = (v_payload ->> 'vehicle_id')::uuid for update;
      if not found then
        raise exception 'Véhicule introuvable' using errcode = 'P0002';
      end if;
      v_date := (v_payload ->> 'date')::date;
      if v_payload ->> 'field' = 'ct_due_date' then
        update public.vehicles set ct_due_date = v_date where id = v_vehicle.id;
      elsif v_payload ->> 'field' = 'tailgate_due_date' then
        -- Contrôle hayon : au mois (comme sur la fiche du véhicule)
        update public.vehicles set tailgate_due_date = date_trunc('month', v_date)::date where id = v_vehicle.id;
      elsif v_payload ->> 'field' = 'antipollution_due_date' then
        update public.vehicles set antipollution_due_date = v_date where id = v_vehicle.id;
      else
        raise exception 'Échéance inconnue' using errcode = '22023';
      end if;
      v_result := jsonb_build_object('vehicle_id', v_vehicle.id, 'link', '/vehicules/' || v_vehicle.id);

    elsif v_action.kind = 'schedule_order' then
      select * into v_ro from public.repair_orders where id = (v_payload ->> 'repair_order_id')::uuid for update;
      if not found then
        raise exception 'OR introuvable' using errcode = 'P0002';
      end if;
      if v_ro.status in ('to_invoice', 'invoiced') then
        raise exception 'OR % déjà terminé : date non changée', v_ro.number using errcode = 'P0001';
      end if;
      if (v_payload ->> 'end_time') is not null
         and ((v_payload ->> 'start_time') is null or (v_payload ->> 'end_time')::time <= (v_payload ->> 'start_time')::time) then
        raise exception 'L''heure de fin doit être après l''heure de début' using errcode = '22023';
      end if;
      update public.repair_orders
         set planned_date = (v_payload ->> 'date')::date,
             planned_start = (v_payload ->> 'start_time')::time,
             planned_end = (v_payload ->> 'end_time')::time
       where id = v_ro.id;
      insert into public.ro_events (repair_order_id, label, actor_id)
      values (v_ro.id, 'Date prévue changée par l''Agent Direction : '
                       || to_char((v_payload ->> 'date')::date, 'DD/MM/YYYY')
                       || coalesce(' à ' || to_char((v_payload ->> 'start_time')::time, 'HH24"h"MI'), ''), auth.uid());
      v_result := jsonb_build_object('repair_order_id', v_ro.id, 'link', '/or/' || v_ro.id);

    elsif v_action.kind = 'appointment_change' then
      select * into v_appt from public.appointments where id = (v_payload ->> 'appointment_id')::uuid for update;
      if not found then
        raise exception 'Rendez-vous introuvable' using errcode = 'P0002';
      end if;
      if v_appt.status not in ('planned', 'requested') then
        raise exception 'Ce rendez-vous n''est plus modifiable' using errcode = 'P0001';
      end if;
      if coalesce((v_payload ->> 'cancel')::boolean, false) then
        update public.appointments set status = 'cancelled' where id = v_appt.id;
      else
        update public.appointments
           set scheduled_date = coalesce((v_payload ->> 'date')::date, scheduled_date),
               start_time = coalesce((v_payload ->> 'start_time')::time, start_time),
               end_time = case when v_payload ? 'end_time' then (v_payload ->> 'end_time')::time else end_time end
         where id = v_appt.id;
      end if;
      v_result := jsonb_build_object('appointment_id', v_appt.id, 'link', '/rendez-vous');

    elsif v_action.kind = 'order_to_invoice' then
      select * into v_ro from public.repair_orders where id = (v_payload ->> 'repair_order_id')::uuid for update;
      if not found then
        raise exception 'OR introuvable' using errcode = 'P0002';
      end if;
      if v_ro.status <> 'work_done' then
        raise exception 'OR % pas « Terminé atelier » : statut non changé', v_ro.number using errcode = 'P0001';
      end if;
      update public.repair_orders set status = 'to_invoice' where id = v_ro.id;
      v_result := jsonb_build_object('repair_order_id', v_ro.id, 'link', '/or/' || v_ro.id);

    else -- invoice_draft
      v_invoice_id := public.build_invoice_draft(
        array(select jsonb_array_elements_text(v_payload -> 'repair_order_ids')::uuid));
      v_result := jsonb_build_object('invoice_id', v_invoice_id, 'link', '/factures/' || v_invoice_id);
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
$function$;

-- Mail groupé relu par la direction : objet et texte modifiés, destinataires retirés (ceux gardés
-- restent ceux préparés par l'agent : aucune adresse ajoutée ici).
create function public.edit_agent_mailing(p_action_id uuid, p_subject text, p_text text, p_client_ids uuid[])
returns public.agent_actions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_action public.agent_actions;
  v_subject text := btrim(coalesce(p_subject, ''));
  v_text text := btrim(coalesce(p_text, ''));
  v_recipients jsonb;
  v_count integer;
begin
  if not public.is_direction() then
    raise exception 'Réservé à la direction' using errcode = '42501';
  end if;
  select * into v_action from public.agent_actions
   where id = p_action_id and profile_id = auth.uid() for update;
  if not found or v_action.kind <> 'send_mailing' then
    raise exception 'Mail groupé introuvable' using errcode = 'P0002';
  end if;
  if v_action.status <> 'proposed' then
    raise exception 'Mail groupé déjà envoyé ou écarté' using errcode = 'P0001';
  end if;
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'Objet du mail : 1 à 200 caractères' using errcode = '22023';
  end if;
  if char_length(v_text) not between 1 and 5000 then
    raise exception 'Texte du mail : 1 à 5 000 caractères' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(r order by ord), '[]'::jsonb), count(*)
    into v_recipients, v_count
    from jsonb_array_elements(v_action.payload -> 'recipients') with ordinality as e(r, ord)
   where (r ->> 'client_id')::uuid = any (coalesce(p_client_ids, '{}'));
  if v_count = 0 then
    raise exception 'Garde au moins un destinataire' using errcode = '22023';
  end if;

  update public.agent_actions
     set payload = payload || jsonb_build_object('subject', v_subject, 'text', v_text,
                                                 'recipients', v_recipients, 'edited', true),
         summary = left('Mail groupé à ' || v_count || ' client' || case when v_count > 1 then 's' else '' end
                        || ' : « ' || v_subject || ' »', 500)
   where id = p_action_id
  returning * into v_action;
  return v_action;
end;
$$;
revoke execute on function public.edit_agent_mailing(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.edit_agent_mailing(uuid, text, text, uuid[]) to authenticated;
