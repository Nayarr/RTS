-- Agent Direction : la pièce peut passer dans n'importe quel statut (« À commander », « Commandée »,
-- « Reçue »), pas seulement « Reçue ». L'action garde son type part_received ; son contenu porte le
-- statut voulu (sans statut : « Reçue », comme les actions déjà proposées). Toujours validée par la
-- direction avant d'être faite.

do $migration$
declare
  v_def text := pg_get_functiondef('public.execute_agent_action(uuid)'::regprocedure);
  v_old text := $old$      update public.ro_lines set order_status = 'received' where id = v_line_id;
      insert into public.ro_events (repair_order_id, label, actor_id)
      values (v_ro.id, 'Pièce reçue (Agent Direction) : ' || (v_payload ->> 'description'), auth.uid());$old$;
  v_new text := $new$      update public.ro_lines
         set order_status = coalesce(v_payload ->> 'status', 'received')::public.part_order_status
       where id = v_line_id;
      insert into public.ro_events (repair_order_id, label, actor_id)
      values (v_ro.id,
              case coalesce(v_payload ->> 'status', 'received')
                when 'to_order' then 'Pièce à commander'
                when 'ordered' then 'Pièce commandée'
                else 'Pièce reçue' end
                || ' (Agent Direction) : ' || (v_payload ->> 'description'),
              auth.uid());$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans execute_agent_action : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
