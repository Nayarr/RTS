-- =============================================================================
-- RTS Atelier : Congés et absences
--   - le technicien demande un congé (en attente) ; la direction saisit une absence
--     directement validée, ou valide / refuse les demandes ;
--   - pas deux absences qui se chevauchent pour un même technicien ;
--   - suppression douce (historique gardé) : direction, ou le technicien pour sa
--     propre demande encore en attente.
-- =============================================================================

create or replace function public.save_leave_request(
  p_leave_type public.leave_type,
  p_starts_on date,
  p_ends_on date,
  p_comment text default null,
  p_technician_id uuid default null   -- absent : demande du technicien connecté
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_direction boolean := public.is_direction();
  v_technician_id uuid := coalesce(p_technician_id, public.current_technician_id());
  v_leave public.leave_requests;
begin
  if not v_direction and (v_technician_id is null or v_technician_id is distinct from public.current_technician_id()) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'Dates invalides : la fin doit être le même jour ou après le début' using errcode = '22023';
  end if;
  if not exists (select 1 from public.technicians where id = v_technician_id) then
    raise exception 'Technicien introuvable' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.leave_requests
    where technician_id = v_technician_id and not is_deleted and status <> 'rejected'
      and starts_on <= p_ends_on and ends_on >= p_starts_on
  ) then
    raise exception 'Une absence existe déjà sur cette période' using errcode = '23P01';
  end if;

  insert into public.leave_requests (technician_id, leave_type, starts_on, ends_on, comment, status,
                                     decided_by, decided_at, created_by)
  values (v_technician_id, p_leave_type, p_starts_on, p_ends_on, nullif(btrim(p_comment), ''),
          case when v_direction then 'approved' else 'requested' end::public.leave_status,
          case when v_direction then auth.uid() end,
          case when v_direction then now() end,
          auth.uid())
  returning * into v_leave;
  return v_leave;
end;
$$;

revoke execute on function public.save_leave_request(public.leave_type, date, date, text, uuid) from public, anon;
grant execute on function public.save_leave_request(public.leave_type, date, date, text, uuid) to authenticated;

-- Décision de la direction sur une demande en attente.
create or replace function public.decide_leave_request(p_id uuid, p_approve boolean)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leave public.leave_requests;
begin
  perform public.assert_direction();
  update public.leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end::public.leave_status,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_id and status = 'requested' and not is_deleted
  returning * into v_leave;
  if not found then
    raise exception 'Cette demande a déjà été traitée' using errcode = 'P0001';
  end if;
  return v_leave;
end;
$$;

revoke execute on function public.decide_leave_request(uuid, boolean) from public, anon;
grant execute on function public.decide_leave_request(uuid, boolean) to authenticated;

-- Suppression (douce) : direction, ou technicien qui annule sa demande encore en attente.
create or replace function public.delete_leave_request(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leave public.leave_requests;
begin
  select * into v_leave from public.leave_requests where id = p_id and not is_deleted;
  if not found then
    raise exception 'Absence introuvable' using errcode = 'P0002';
  end if;
  if not (public.is_direction()
          or (v_leave.technician_id = public.current_technician_id() and v_leave.status = 'requested')) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  update public.leave_requests set is_deleted = true where id = p_id;
end;
$$;

revoke execute on function public.delete_leave_request(uuid) from public, anon;
grant execute on function public.delete_leave_request(uuid) to authenticated;
