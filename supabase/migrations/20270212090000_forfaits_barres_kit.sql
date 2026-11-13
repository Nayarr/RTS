-- Forfaits de la fiche de contrôle : kit accessoires et barres.
--   Kit accessoires HS / 50 % : forfait de 3 h.
--   Barre d'accouplement seule : forfait de 2 h ; barre de direction seule : forfait de 2 h.
--   Les deux barres : un seul forfait « barres d'accouplement et de direction » de 3 h (1,5 h chacune).
-- La couverture des cases (sync_inspection_work) prend d'abord le forfait qui couvre le plus de cases :
-- avec les deux barres, le forfait des deux passe avant les forfaits d'une barre, qui ne sont pas ajoutés.
-- Prix : heures × taux horaire de la catégorie (les forfaits restent modifiables dans Atelier › Forfaits).
-- Un forfait actif déjà déclenché exactement par les mêmes cases (créé par la direction) est gardé.

insert into public.service_packages (name, category, standard_hours, price, trigger_fields)
select f.name, f.category::public.labor_category, f.hours,
       round(f.hours * coalesce((select r.hourly_rate from public.labor_rates r
                                 where r.category = f.category::public.labor_category
                                 order by r.sort_order limit 1), 0), 2),
       f.fields
from (values
  ('Remplacement kit accessoires',                       'pl',  3::numeric, array['kit_accessoires']),
  ('Remplacement kit accessoires',                       'vul', 3,          array['kit_accessoires']),
  ('Remplacement barre d''accouplement',                 'pl',  2,          array['barre_accouplement']),
  ('Remplacement barre de direction',                    'pl',  2,          array['barre_direction']),
  ('Remplacement barres d''accouplement et de direction', 'pl', 3,          array['barre_accouplement', 'barre_direction'])
) as f(name, category, hours, fields)
where not exists (
  select 1 from public.service_packages p
  where p.is_active
    and p.trigger_fields @> f.fields and p.trigger_fields <@ f.fields
    and p.category is not distinct from f.category::public.labor_category
);
