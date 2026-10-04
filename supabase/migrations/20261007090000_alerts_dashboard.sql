-- =============================================================================
-- RTS Atelier : Alertes (cloche) et tableau de bord du bureau
--   - alertes de l'utilisateur connecté avec leur état « lu » ;
--   - chiffres du tableau de bord calculés en une seule requête (droits de
--     l'utilisateur appliqués : fonction en security invoker).
-- =============================================================================

-- Alertes visibles par l'utilisateur (son rôle ou lui-même), lues ou non.
create view public.v_my_notifications
with (security_invoker = on) as
select n.*, r.read_at
from public.notifications n
left join public.notification_reads r on r.notification_id = n.id and r.profile_id = auth.uid();

revoke all on public.v_my_notifications from public, anon;
grant select on public.v_my_notifications to authenticated;

-- Tableau de bord du bureau : OR par statut, devis, factures en retard, pièces,
-- rendez-vous, congés à traiter, charge de travail par technicien.
create or replace function public.office_dashboard()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
begin
  if not public.is_office() then
    raise exception 'Accès refusé : réservé au bureau' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'repair_orders', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*) as total from public.repair_orders where status <> 'invoiced' group by status) s),
    'parts_to_order', (
      select count(*) from public.ro_lines l join public.repair_orders r on r.id = l.repair_order_id
      where l.line_type = 'part' and l.order_status = 'to_order' and r.status <> 'invoiced'),
    'quotes_awaiting_response', (select count(*) from public.quotes where status = 'sent'),
    'quotes_to_convert', (
      select count(*) from public.quotes
      where status = 'accepted' and resulting_repair_order_id is null and merged_into_repair_order_id is null),
    'overdue_invoices', (
      select jsonb_build_object('count', count(*), 'balance_due', coalesce(sum(balance_due), 0))
      from public.v_invoice_balances where payment_status = 'overdue'),
    'appointments_today', (
      select count(*) from public.appointments where status = 'planned' and scheduled_date = v_today),
    'reminders_to_send', (
      select count(*) from public.appointments
      where status = 'planned' and scheduled_date = v_today + 1 and reminder_sent_at is null),
    'leave_requests', (
      select count(*) from public.leave_requests where status = 'requested' and not is_deleted),
    'workload', (
      select coalesce(jsonb_agg(w order by w.sort_order, w.name), '[]'::jsonb)
      from (
        select t.id as technician_id, t.display_name as name, t.color, t.sort_order,
               count(o.id) as orders, coalesce(sum(o.declared_hours), 0) as hours
        from public.technicians t
        left join public.v_repair_orders_overview o on o.technician_id = t.id and o.status <> 'invoiced'
        where t.is_active and not t.exclude_from_planning
        group by t.id
      ) w)
  );
end;
$$;

revoke execute on function public.office_dashboard() from public, anon;
grant execute on function public.office_dashboard() to authenticated;
