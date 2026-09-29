-- =============================================================================
-- RTS Atelier — Écran atelier (télé)
--   Tableau du jour, une colonne par technicien : OR en cours, OR assignés
--   prévus aujourd'hui (ou sans date), absences, véhicules attendus.
--   Lisible par le bureau et par le compte de la borne (la télé tourne sur la
--   borne : aucune session du bureau laissée ouverte sur un écran partagé).
--   Seules les informations affichées sont renvoyées (ni prix, ni coordonnées).
-- =============================================================================

create or replace function public.workshop_board()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
begin
  if not (public.is_office() or public.is_kiosk()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'company_name', (select legal_name from public.company_settings),
    'rest_reference_monday', (select rest_reference_monday from public.app_settings),
    'technicians', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id, 'name', t.display_name, 'color', t.color, 'rest_group', t.rest_group)
             order by t.sort_order, t.display_name)
      from public.technicians t
      where t.is_active and not t.exclude_from_planning
    ), '[]'::jsonb),
    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object(
               'technician_id', l.technician_id, 'leave_type', l.leave_type,
               'starts_on', l.starts_on, 'ends_on', l.ends_on))
      from public.leave_requests l
      where l.status = 'approved' and l.starts_on <= v_today and l.ends_on >= v_today
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'technician_id', r.technician_id, 'plate', v.plate,
               'task', r.requested_work, 'status', r.status,
               'running', exists (select 1 from public.time_entries te
                                  where te.repair_order_id = r.id and te.ended_at is null),
               'planned_start', r.planned_start, 'planned_end', r.planned_end,
               'parts_pending', exists (select 1 from public.ro_lines l
                                        where l.repair_order_id = r.id and l.line_type = 'part'
                                          and l.order_status <> 'received')))
      from public.repair_orders r
      join public.vehicles v on v.id = r.vehicle_id
      where r.technician_id is not null
        and (r.status = 'in_progress'
             or (r.status = 'assigned' and (r.planned_date = v_today or r.planned_date is null)))
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'start_time', a.start_time, 'plate', v.plate, 'client_name', c.name)
             order by a.start_time)
      from public.appointments a
      left join public.vehicles v on v.id = a.vehicle_id
      left join public.clients c on c.id = coalesce(a.client_id, v.client_id)
      where a.status = 'planned' and a.scheduled_date = v_today
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.workshop_board() from public, anon;
grant execute on function public.workshop_board() to authenticated;
