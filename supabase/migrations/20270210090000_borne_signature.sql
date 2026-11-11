-- Borne de signature : compte à part (rôle kiosk_signature) qui affiche toutes les demandes de
-- signature en cours (chacune 1 minute) ; le client touche « Signer » sur la sienne. La borne de
-- badgeage (rôle kiosk) ne sert plus qu'au pointage. Fonctions modifiées par pg_get_functiondef + replace.

create function public.is_signature_kiosk()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'kiosk_signature', false);
$$;

-- Remplace un texte dans une fonction existante (erreur si le texte a changé).
create function pg_temp.patch_function(p_function regprocedure, p_old text, p_new text)
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_function);
begin
  if position(p_old in v_def) = 0 then
    raise exception 'Texte introuvable dans % : %', p_function, p_old;
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- Fiche d'une demande à signer (devis ou OR), tirée de kiosk_pending_signature.
do $migration$
declare
  v_def text := pg_get_functiondef('public.kiosk_pending_signature()'::regprocedure);
  v_steps text[][] := array[
    array['FUNCTION public.kiosk_pending_signature()', 'FUNCTION public.kiosk_signature_json(p_request_id uuid)'],
    array[$o$  if not public.is_kiosk() then
    raise exception 'Accès réservé à la borne' using errcode = '42501';$o$,
          $n$  if not public.is_signature_kiosk() then
    raise exception 'Accès réservé à la borne de signature' using errcode = '42501';$n$],
    array[$o$  where channel = 'kiosk' and status = 'pending' and expires_at > now()
  order by created_at limit 1;$o$,
          $n$  where id = p_request_id and channel = 'kiosk' and status = 'pending' and expires_at > now();$n$]];
  i integer;
begin
  for i in 1 .. array_length(v_steps, 1) loop
    if position(v_steps[i][1] in v_def) = 0 then
      raise exception 'Texte introuvable dans kiosk_pending_signature : %', v_steps[i][1];
    end if;
    v_def := replace(v_def, v_steps[i][1], v_steps[i][2]);
  end loop;
  execute v_def;
end;
$migration$;

-- Toutes les demandes en cours, de la plus ancienne à la plus récente.
create function public.kiosk_pending_signatures()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_signature_kiosk() then
    raise exception 'Accès réservé à la borne de signature' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.kiosk_signature_json(r.id) order by r.created_at)
    from public.signature_requests r
    where r.channel = 'kiosk' and r.status = 'pending' and r.expires_at > now()), '[]'::jsonb);
end;
$$;

revoke execute on function public.is_signature_kiosk() from public, anon;
revoke execute on function public.kiosk_signature_json(uuid) from public, anon;
revoke execute on function public.kiosk_pending_signatures() from public, anon;
grant execute on function public.is_signature_kiosk(), public.kiosk_signature_json(uuid), public.kiosk_pending_signatures()
  to authenticated;

-- Signature et ancienne demande unique : réservées à la borne de signature.
select pg_temp.patch_function('public.kiosk_pending_signature()',
  $o$  if not public.is_kiosk() then
    raise exception 'Accès réservé à la borne' using errcode = '42501';$o$,
  $n$  if not public.is_signature_kiosk() then
    raise exception 'Accès réservé à la borne de signature' using errcode = '42501';$n$);
select pg_temp.patch_function('public.kiosk_sign_repair_order(uuid, text, uuid)',
  $o$  if not public.is_kiosk() then
    raise exception 'Accès réservé à la borne' using errcode = '42501';$o$,
  $n$  if not public.is_signature_kiosk() then
    raise exception 'Accès réservé à la borne de signature' using errcode = '42501';$n$);

-- Image de la signature envoyée par la borne de signature (plus par la borne de badgeage).
select pg_temp.patch_function('public.can_upload_file(public.file_category)',
  $o$      when 'signature'        then public.is_office() or public.current_technician_id() is not null or public.is_kiosk()$o$,
  $n$      when 'signature'        then public.is_office() or public.current_technician_id() is not null or public.is_signature_kiosk()$n$);

-- Présence : les deux bornes la signalent, mais « borne en ligne » (avant d'envoyer une signature)
-- ne regarde que la borne de signature.
select pg_temp.patch_function('public.kiosk_ping()',
  $o$  if not public.is_kiosk() then$o$,
  $n$  if not (public.is_kiosk() or public.is_signature_kiosk()) then$n$);
select pg_temp.patch_function('public.kiosk_status()',
  $o$  select max(last_seen_at) into v_last from public.kiosk_presence;$o$,
  $n$  select max(k.last_seen_at) into v_last from public.kiosk_presence k
  join public.profiles p on p.id = k.profile_id and p.role = 'kiosk_signature';$n$);

-- Sortie de la borne de signature avec le même code que la borne de badgeage.
select pg_temp.patch_function('public.verify_kiosk_exit_code(text)',
  $o$  if not (public.is_kiosk() or public.is_direction()) then$o$,
  $n$  if not (public.is_kiosk() or public.is_signature_kiosk() or public.is_direction()) then$n$);
