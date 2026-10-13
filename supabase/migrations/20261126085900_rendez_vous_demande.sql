-- Rendez-vous demandé par le client depuis la page publique de prise de rendez-vous :
-- il attend la confirmation du bureau (statut « requested »), puis devient « planned ».
-- Valeur ajoutée seule dans sa migration : Postgres ne permet pas de l'utiliser dans la même transaction.
alter type public.appointment_status add value if not exists 'requested' before 'planned';
