-- La réception badge à la borne, comme les techniciens et le comptable.
-- - Nouveau compte réception : fiche technicien obligatoire (pour badger), hors planning par défaut ;
--   la direction peut ensuite la faire apparaître au planning (rien n'est forcé, contrairement au comptable).
-- - Comptes réception existants : fiche créée d'office, hors planning ; la direction leur donne un code
--   PIN dans Équipe. Une ancienne fiche désactivée est réactivée (historique gardé).

do $migration$
declare
  v_def text := pg_get_functiondef('public.admin_register_account'::regproc);
  v_old text := $old$  insert into public.profiles (id, email, full_name, role)$old$;
  v_new text := $new$  if p_role = 'reception' and p_technician is null then
    raise exception 'Un compte réception doit avoir une fiche technicien pour badger' using errcode = '22023';
  end if;

  insert into public.profiles (id, email, full_name, role)$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'admin_register_account : insertion du profil introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

-- Comptes réception actifs sans fiche active
update public.technicians t
   set is_active = true, exclude_from_planning = true
  from public.profiles p
 where p.id = t.profile_id and p.role = 'reception' and p.is_active and not t.is_active;

insert into public.technicians (profile_id, display_name, exclude_from_planning)
select p.id, left(coalesce(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 'Réception'), 40), true
from public.profiles p
where p.role = 'reception' and p.is_active
  and not exists (select 1 from public.technicians t where t.profile_id = p.id);

-- La fiche de la réception (ou du comptable) sert au pointage : une ligne de travaux saisie par le
-- bureau reste au technicien de l'OR, elle n'est pas notée comme faite par l'accueil.
do $migration$
declare
  v_def text := pg_get_functiondef('public.ro_lines_set_performer'::regproc);
  v_old text := $old$  if v_tech is not null and new.kind = 'done'$old$;
  v_new text := $new$  if v_tech is not null and new.kind = 'done' and public.current_app_role() = 'technician'$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans ro_lines_set_performer : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
