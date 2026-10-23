-- =============================================================================
-- Borne : le technicien change lui-même son code PIN
--
-- Sur la borne, « Changer mon code » : code actuel, puis nouveau code saisi deux fois. Le code
-- actuel est vérifié comme au pointage (un code faux compte dans les tentatives, la borne se bloque
-- au-delà) ; le nouveau code ne doit être celui d'aucun autre technicien. La direction garde la
-- main dans Équipe (code oublié).
-- =============================================================================

-- Technicien actif dont le code est p_pin (null si aucun).
create or replace function public.technician_by_pin(p_pin text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pin record;
begin
  if coalesce(p_pin, '') !~ '^\d{4,6}$' then
    return null;
  end if;
  for v_pin in
    select p.technician_id, p.pin_hash, p.algorithm, t.legacy_email
    from public.technician_pins p join public.technicians t on t.id = p.technician_id
    where t.is_active
  loop
    if (v_pin.algorithm = 'bcrypt' and extensions.crypt(p_pin, v_pin.pin_hash) = v_pin.pin_hash)
       or (v_pin.algorithm = 'legacy_sha256'
           and encode(extensions.digest('rts:' || lower(coalesce(v_pin.legacy_email, '')) || ':' || p_pin, 'sha256'), 'hex')
               = v_pin.pin_hash) then
      return v_pin.technician_id;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.technician_by_pin(text) from public, anon, authenticated;

-- Ne lève pas d'erreur pour un mauvais code (la tentative est comptée) : retourne { ok, message }.
create or replace function public.kiosk_change_pin(p_current text, p_new text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tech public.technicians;
  v_owner uuid;
begin
  if not (public.is_kiosk() or public.is_direction()) then
    raise exception 'Accès refusé : compte borne requis' using errcode = '42501';
  end if;
  if public.kiosk_too_many_attempts() then
    return jsonb_build_object('ok', false, 'message', 'Trop de tentatives, patiente une minute.');
  end if;

  select * into v_tech from public.technicians where id = public.technician_by_pin(p_current);
  if v_tech.id is null then
    insert into public.kiosk_failed_attempts (attempted_by) values (auth.uid());
    return jsonb_build_object('ok', false, 'message', 'Code actuel incorrect');
  end if;
  if coalesce(p_new, '') !~ '^\d{4,6}$' then
    return jsonb_build_object('ok', false, 'message', 'Le nouveau code doit contenir 4 à 6 chiffres');
  end if;
  if p_new = p_current then
    return jsonb_build_object('ok', false, 'message', 'Choisis un code différent de l''actuel');
  end if;
  v_owner := public.technician_by_pin(p_new);
  if v_owner is not null and v_owner <> v_tech.id then
    -- Message neutre : ne dit pas à qui est le code
    return jsonb_build_object('ok', false, 'message', 'Ce code n''est pas disponible, choisis-en un autre');
  end if;

  update public.technician_pins
     set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 8)), algorithm = 'bcrypt', set_at = now()
   where technician_id = v_tech.id;
  return jsonb_build_object('ok', true, 'technician_name', v_tech.display_name);
end;
$$;
revoke execute on function public.kiosk_change_pin(text, text) from public, anon;
grant execute on function public.kiosk_change_pin(text, text) to authenticated;
comment on function public.kiosk_change_pin(text, text) is
  'Borne : un technicien remplace son code PIN (code actuel vérifié, tentatives comptées).';
