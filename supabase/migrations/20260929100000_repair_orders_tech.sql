-- =============================================================================
-- RTS Atelier — Ordres de réparation côté technicien
-- =============================================================================

-- Photo retirée d'un OR : le fichier est marqué supprimé (objet purgé du stockage ensuite).
create or replace function public.ro_photos_release_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.files set deleted_at = now()
  where id = old.file_id and deleted_at is null
    and not exists (select 1 from public.ro_photos where file_id = old.file_id);
  return null;
end;
$$;

revoke execute on function public.ro_photos_release_file() from public, anon, authenticated;

create trigger ro_photos_release_file
  after delete on public.ro_photos
  for each row execute function public.ro_photos_release_file();

-- Un libellé de photo n'est jamais vide (photos obligatoires, pièces, étiquettes…).
alter table public.ro_photos
  add constraint ro_photos_label_not_empty check (btrim(label) <> '');
