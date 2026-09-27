-- =============================================================================
-- RTS Atelier — Réglages de l'entreprise : garde-fous du logo
-- =============================================================================

-- Le logo doit être un fichier « logo » dont l'envoi est confirmé ; l'ancien logo
-- remplacé est marqué supprimé (objet purgé du stockage ensuite).
create or replace function public.company_settings_logo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.logo_file_id is not distinct from old.logo_file_id then
    return new;
  end if;

  if new.logo_file_id is not null and not exists (
    select 1 from public.files
    where id = new.logo_file_id and category = 'logo' and uploaded_at is not null and deleted_at is null
  ) then
    raise exception 'Logo invalide : envoie une image avec le bouton « Changer le logo »' using errcode = '22023';
  end if;

  if old.logo_file_id is not null then
    update public.files set deleted_at = now() where id = old.logo_file_id and deleted_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.company_settings_logo_guard() from public, anon, authenticated;

create trigger company_settings_logo_guard
  before update of logo_file_id on public.company_settings
  for each row execute function public.company_settings_logo_guard();
