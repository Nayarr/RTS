-- « Profitez de l'immobilisation » : mail des échéances proposées au client, tracé comme les autres
-- messages de l'OR. Valeur ajoutée seule (utilisable seulement après validation de la transaction).
alter type public.client_message_type add value if not exists 'upcoming_work';
