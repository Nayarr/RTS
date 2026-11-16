-- Forfaits de barres (accouplement, direction) en catégorie VUL : un utilitaire n'a pas de barres sur sa
-- fiche de contrôle, ces forfaits n'ont pas lieu d'être. Désactivés (pas supprimés : les devis et
-- factures qui les citent gardent leur ligne), ils disparaissent des listes et de la fiche de contrôle.
update public.service_packages
   set is_active = false
 where is_active
   and category = 'vul'
   and (trigger_fields && array['barre_accouplement', 'barre_direction']
        or name ilike '%barre%accouplement%' or name ilike '%barre%direction%');
