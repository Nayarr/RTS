-- PDF accepté partout où l'assistant lit un document : photo d'étiquette de l'OR (hayon, contrôle technique)
-- et étiquette lue, en plus des photos (JPEG, PNG, WebP). Pointage, logo et signature restent des images.
create or replace function public.file_mime_allowed(p_category public.file_category, p_mime_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_category in ('clock_photo', 'logo', 'signature')
      then p_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    when p_category = 'document_pdf'
      then p_mime_type = 'application/pdf'
    else p_mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  end;
$$;

revoke execute on function public.file_mime_allowed(public.file_category, text) from public, anon, authenticated;
