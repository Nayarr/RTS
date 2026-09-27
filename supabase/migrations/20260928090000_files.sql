-- =============================================================================
-- RTS Atelier — Fichiers stockés dans Cloudflare R2
--
-- Parcours d'un envoi (Edge Function « files ») :
--   1. register_file        : l'appelant (avec ses droits) réserve une ligne « en attente »
--                             et une clé de stockage générée ici ;
--   2. envoi direct du navigateur vers R2 avec une URL signée (type imposé) ;
--   3. confirm_file_upload  : la fonction vérifie l'objet dans R2 puis confirme (clé de service).
-- Seuls les fichiers confirmés sont téléchargeables. Les envois jamais confirmés
-- expirent au bout de 24 h (expire_pending_files).
-- =============================================================================

alter table public.files
  add column uploaded_at   timestamptz,   -- null = envoi en attente de confirmation
  add column original_name text check (char_length(original_name) <= 200);

comment on column public.files.uploaded_at is 'Confirmation de l''envoi (objet présent dans R2). Null = en attente.';
comment on column public.files.original_name is 'Nom du fichier d''origine (téléchargement des PDF).';

-- Fichiers existants (reprise de données) : considérés comme confirmés.
update public.files set uploaded_at = created_at where uploaded_at is null;

create index files_pending_idx on public.files (created_at) where uploaded_at is null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Règles d'envoi par catégorie
-- ---------------------------------------------------------------------------

-- Qui peut envoyer quoi (compte actif requis).
create or replace function public.can_upload_file(p_category public.file_category)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case p_category
      when 'ro_photo'         then public.is_office() or public.current_technician_id() is not null
      when 'signature'        then public.is_office() or public.current_technician_id() is not null
      when 'registration_doc' then public.is_office() or public.current_technician_id() is not null
      when 'label_scan'       then public.is_office() or public.current_technician_id() is not null
      when 'clock_photo'      then public.is_kiosk()
      when 'document_pdf'     then public.is_office()
      when 'logo'             then public.is_direction()
      when 'other'            then public.is_office()
    end, false);
$$;

-- Types acceptés par catégorie.
create or replace function public.file_mime_allowed(p_category public.file_category, p_mime_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category in ('ro_photo', 'clock_photo', 'label_scan', 'logo', 'signature')
      then p_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    when p_category = 'document_pdf'
      then p_mime_type = 'application/pdf'
    else p_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  end;
$$;

-- Taille maximale par catégorie (les photos sont compressées par l'appli avant l'envoi).
create or replace function public.file_max_bytes(p_category public.file_category)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'signature'   then 1 * 1024 * 1024
    when 'logo'        then 2 * 1024 * 1024
    when 'clock_photo' then 2 * 1024 * 1024
    when 'ro_photo'    then 10 * 1024 * 1024
    when 'label_scan'  then 10 * 1024 * 1024
    else 20 * 1024 * 1024
  end::bigint;
$$;

-- ---------------------------------------------------------------------------
-- Étape 1 : réservation (droits de l'appelant)
-- ---------------------------------------------------------------------------
create or replace function public.register_file(
  p_category public.file_category,
  p_mime_type text,
  p_size_bytes bigint,
  p_bucket text,
  p_original_name text default null
)
returns table (file_id uuid, storage_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_extension text;
  v_key text;
  v_id uuid;
begin
  if not public.can_upload_file(p_category) then
    raise exception 'Accès refusé : envoi de ce type de fichier non autorisé' using errcode = '42501';
  end if;
  if not public.file_mime_allowed(p_category, p_mime_type) then
    raise exception 'Type de fichier non accepté : %', p_mime_type using errcode = '22023';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > public.file_max_bytes(p_category) then
    raise exception 'Fichier trop volumineux (maximum % Mo)', public.file_max_bytes(p_category) / 1024 / 1024
      using errcode = '22023';
  end if;

  v_extension := case p_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    when 'application/pdf' then 'pdf'
  end;
  v_id := gen_random_uuid();
  -- Clé non devinable, rangée par catégorie et par mois.
  v_key := format('%s/%s/%s.%s', p_category, to_char(now(), 'YYYY/MM'), v_id, v_extension);

  insert into public.files (id, bucket, storage_key, category, mime_type, size_bytes, uploaded_by, original_name)
  values (v_id, p_bucket, v_key, p_category, p_mime_type, p_size_bytes, auth.uid(),
          nullif(left(btrim(p_original_name), 200), ''));

  return query select v_id, v_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Étape 3 : confirmation (clé de service, après vérification de l'objet dans R2)
-- ---------------------------------------------------------------------------
create or replace function public.confirm_file_upload(
  p_file_id uuid,
  p_user_id uuid,
  p_size_bytes bigint,
  p_mime_type text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.files;
begin
  select * into v_file from public.files
  where id = p_file_id and uploaded_by = p_user_id and uploaded_at is null and deleted_at is null
  for update;
  if not found then
    raise exception 'Envoi introuvable ou déjà confirmé' using errcode = 'P0002';
  end if;
  if p_mime_type is distinct from v_file.mime_type then
    raise exception 'Type de fichier différent de celui annoncé' using errcode = '22023';
  end if;
  if p_size_bytes > public.file_max_bytes(v_file.category) then
    raise exception 'Fichier trop volumineux (maximum % Mo)', public.file_max_bytes(v_file.category) / 1024 / 1024
      using errcode = '22023';
  end if;

  update public.files set uploaded_at = now(), size_bytes = p_size_bytes where id = p_file_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Envois jamais confirmés : marqués supprimés après 24 h (objet R2 purgé ensuite).
-- ---------------------------------------------------------------------------
create or replace function public.expire_pending_files()
returns integer
language sql
security definer
set search_path = ''
as $$
  with expired as (
    update public.files set deleted_at = now()
    where uploaded_at is null and deleted_at is null and created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::integer from expired;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-expire-pending-files', '15 * * * *', 'select public.expire_pending_files()');
  else
    raise notice 'pg_cron indisponible : expiration des envois non planifiée';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------
revoke execute on function
  public.can_upload_file(public.file_category),
  public.file_mime_allowed(public.file_category, text),
  public.file_max_bytes(public.file_category),
  public.register_file(public.file_category, text, bigint, text, text),
  public.confirm_file_upload(uuid, uuid, bigint, text),
  public.expire_pending_files()
from public, anon, authenticated;

grant execute on function
  public.can_upload_file(public.file_category),
  public.file_mime_allowed(public.file_category, text),
  public.file_max_bytes(public.file_category),
  public.register_file(public.file_category, text, bigint, text, text)
to authenticated;

grant execute on function public.confirm_file_upload(uuid, uuid, bigint, text) to service_role;
