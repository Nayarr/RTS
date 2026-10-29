-- =============================================================================
-- Push de la direction : suivi de l'atelier en direct, toutes ses alertes sur l'appareil
--
-- Demande du client :
--   - push à la direction quand un technicien commence un OR, le met en pause, le reprend,
--     termine les travaux ;
--   - toute alerte de la cloche adressée à la direction part aussi en push (signature reçue,
--     location reconduite, badge pendant une absence, sous-traitance en retard compris).
-- La nuit (21 h - 7 h), le push attend 7 h comme les autres ; un même OR ne garde que son
-- dernier état en attente (même tag). Jamais pour sa propre action (queue_push).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Cloche : tout ce qui est adressé à la direction part en push
-- ---------------------------------------------------------------------------
create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Demande de congé : déjà poussée à la demande (leave_requests_push)
  if new.type = 'leave_request' then
    return null;
  end if;
  -- Réception : information seule (location reconduite, OR signé) dans la cloche seulement
  if new.recipient_role is distinct from 'direction'
     and new.type not in ('quote_response', 'pre_quote_work', 'kiosk_lockout', 'appointment_requested',
                          'rental_renewal_blocked', 'late_repair_order', 'overdue_invoice', 'low_stock',
                          'contract_service_due', 'appointment_reminder', 'quotes_unsigned') then
    return null;
  end if;
  perform public.queue_push(
    case when new.recipient_profile_id is not null then array[new.recipient_profile_id]
         else public.profiles_with_roles(array[new.recipient_role]) end,
    new.title, new.body, new.link, 'notification-' || coalesce(new.dedupe_key, new.id::text),
    -- Réponse d'un client : tout de suite ; le reste attend le matin la nuit
    case when new.type <> 'quote_response' then public.push_quiet_until() end);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atelier en direct : OR commencé, en pause, repris, travaux terminés
-- ---------------------------------------------------------------------------
create function public.queue_work_push(p_repair_order_id uuid, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_plate text;
  v_technician text;
begin
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found then
    return;
  end if;
  select plate into v_plate from public.vehicles where id = v_ro.vehicle_id;
  select display_name into v_technician from public.technicians where id = v_ro.technician_id;
  perform public.queue_push(
    public.profiles_with_roles(array['direction']::public.app_role[]),
    p_event || ' : ' || coalesce(v_plate, v_ro.number),
    concat_ws(' · ', v_technician, v_ro.number, nullif(split_part(btrim(v_ro.requested_work), E'\n', 1), '')),
    '/or/' || v_ro.id,
    -- Un seul message en attente par OR : son dernier état
    'ro-work-' || v_ro.id,
    public.push_quiet_until());
end;
$$;
revoke execute on function public.queue_work_push(uuid, text) from public, anon, authenticated;

-- Badgeage démarré : premier de l'OR (commencé) ou après une pause (repris)
create function public.time_entries_work_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.queue_work_push(new.repair_order_id,
      case when exists (select 1 from public.time_entries
                        where repair_order_id = new.repair_order_id and id <> new.id)
           then 'OR repris' else 'OR commencé' end);
  -- Pause par le technicien lui-même (pas un chrono arrêté par la direction ou un changement
  -- de technicien). Travaux terminés dans la foulée : ce message est remplacé (même tag).
  elsif old.ended_at is null and new.ended_at is not null and new.stopped_by is null then
    perform public.queue_work_push(new.repair_order_id, 'OR en pause');
  end if;
  return null;
end;
$$;
revoke execute on function public.time_entries_work_push() from public, anon, authenticated;

create trigger time_entries_work_push
  after insert or update of ended_at on public.time_entries
  for each row execute function public.time_entries_work_push();

-- Travaux terminés par le technicien (avec ou sans devis à faire)
create function public.repair_orders_done_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.queue_work_push(new.id,
    case when new.status = 'quote_pending' then 'Travaux terminés, devis à faire' else 'Travaux terminés' end);
  return null;
end;
$$;
revoke execute on function public.repair_orders_done_push() from public, anon, authenticated;

create trigger repair_orders_done_push
  after update of status on public.repair_orders
  for each row
  when (old.status in ('assigned', 'in_progress') and new.status in ('work_done', 'quote_pending'))
  execute function public.repair_orders_done_push();
