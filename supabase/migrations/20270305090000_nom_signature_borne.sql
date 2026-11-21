-- Borne de signature : le nom du signataire est obligatoire, comme sur le lien de signature par e-mail.

do $migration$
declare
  v_def text := pg_get_functiondef('public.kiosk_sign_repair_order'::regproc);
  v_old text := $old$  if p_signature_file_id is null then
    raise exception 'Signez dans le cadre prévu' using errcode = '22023';
  end if;$old$;
  v_new text := $new$  if coalesce(btrim(p_signer_name), '') = '' then
    raise exception 'Indiquez votre nom' using errcode = '22023';
  end if;
  if p_signature_file_id is null then
    raise exception 'Signez dans le cadre prévu' using errcode = '22023';
  end if;$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans kiosk_sign_repair_order : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
