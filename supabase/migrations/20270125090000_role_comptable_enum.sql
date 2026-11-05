-- Rôle « Comptable » : valeur ajoutée à part, une transaction ne peut pas utiliser la valeur qu'elle crée.
alter type public.app_role add value if not exists 'accountant';
