-- Agent Direction : « la pièce X de l'OR Y est arrivée ». L'agent prépare le passage de la pièce en
-- « Reçue » (part_received) ; rien n'est écrit tant que la direction ne l'a pas validé dans l'appli.

alter table public.agent_actions drop constraint agent_actions_kind_check;
alter table public.agent_actions add constraint agent_actions_kind_check check (kind in (
  'appointment', 'ro_work', 'assign_technician', 'send_mail', 'send_mailing', 'vehicle_deadline',
  'schedule_order', 'appointment_change', 'order_to_invoice', 'invoice_draft', 'part_received'));

-- Nouvelle branche ajoutée à la dernière version de la fonction (jamais recopiée).
do $$
declare
  v_def text := pg_get_functiondef('public.execute_agent_action(uuid)'::regprocedure);
  v_new text;
  v_anchor constant text := '    elsif v_action.kind = ''order_to_invoice'' then';
begin
  v_new := replace(v_def, v_anchor, $branch$    elsif v_action.kind = 'part_received' then
      select * into v_ro from public.repair_orders where id = (v_payload ->> 'repair_order_id')::uuid for update;
      if not found then
        raise exception 'OR introuvable' using errcode = 'P0002';
      end if;
      if v_ro.status = 'invoiced' then
        raise exception 'OR % déjà facturé : pièce non changée', v_ro.number using errcode = 'P0001';
      end if;
      select id into v_line_id from public.ro_lines
       where id = (v_payload ->> 'line_id')::uuid and repair_order_id = v_ro.id and line_type = 'part'
       for update;
      if not found then
        raise exception 'Pièce introuvable sur l''OR %', v_ro.number using errcode = 'P0002';
      end if;
      update public.ro_lines set order_status = 'received' where id = v_line_id;
      insert into public.ro_events (repair_order_id, label, actor_id)
      values (v_ro.id, 'Pièce reçue (Agent Direction) : ' || (v_payload ->> 'description'), auth.uid());
      v_result := jsonb_build_object('repair_order_id', v_ro.id, 'line_id', v_line_id, 'link', '/or/' || v_ro.id);

$branch$ || v_anchor);
  if v_new = v_def then
    raise exception 'execute_agent_action : texte introuvable (%)', v_anchor;
  end if;
  execute v_new;
end;
$$;
