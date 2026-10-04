-- =============================================================================
-- RTS Atelier : Gestion de l'équipe (comptes, rôles, techniciens, PIN)
-- =============================================================================

-- Enregistre le profil (et la fiche technicien) d'un compte qui vient d'être créé
-- dans Supabase Auth. Appelée uniquement par l'Edge Function admin-users (clé de
-- service), en une seule transaction.
create or replace function public.admin_register_account(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_role public.app_role,
  p_technician jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role = 'technician' and p_technician is null then
    raise exception 'Un compte technicien doit avoir une fiche technicien' using errcode = '22023';
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (p_user_id, lower(btrim(p_email)), btrim(p_full_name), p_role);

  if p_technician is not null then
    insert into public.technicians (profile_id, display_name, color, exclude_from_planning)
    values (
      p_user_id,
      coalesce(nullif(btrim(p_technician ->> 'display_name'), ''), btrim(p_full_name)),
      nullif(p_technician ->> 'color', ''),
      coalesce((p_technician ->> 'exclude_from_planning')::boolean, false)
    );
  end if;

  return p_user_id;
end;
$$;

revoke execute on function public.admin_register_account(uuid, text, text, public.app_role, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_register_account(uuid, text, text, public.app_role, jsonb) to service_role;

-- Garde-fou : il reste toujours au moins une direction active.
create or replace function public.profiles_keep_one_direction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'direction' and old.is_active
     and (tg_op = 'DELETE' or new.role <> 'direction' or not new.is_active)
     and not exists (
       select 1 from public.profiles
       where role = 'direction' and is_active and id <> old.id) then
    raise exception 'Impossible : il doit rester au moins un compte Direction actif' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.profiles_keep_one_direction() from public, anon, authenticated;

create trigger profiles_keep_one_direction
  before update of role, is_active or delete on public.profiles
  for each row execute function public.profiles_keep_one_direction();

-- État des codes PIN (sans jamais exposer les empreintes) : direction uniquement.
create or replace function public.technician_pin_status()
returns table (technician_id uuid, set_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_direction();
  return query select p.technician_id, p.set_at from public.technician_pins p;
end;
$$;

revoke execute on function public.technician_pin_status() from public, anon;
grant execute on function public.technician_pin_status() to authenticated;

-- Suppression d'un code PIN (technicien qui quitte l'atelier, code compromis).
create or replace function public.clear_technician_pin(p_technician_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_direction();
  delete from public.technician_pins where technician_id = p_technician_id;
end;
$$;

revoke execute on function public.clear_technician_pin(uuid) from public, anon;
grant execute on function public.clear_technician_pin(uuid) to authenticated;
