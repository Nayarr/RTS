-- =============================================================================
-- Taux horaires : types de main d'œuvre ajoutés ou supprimés par la direction
--
-- Demande du client : dans Réglages › Taux horaires, en plus de modifier les prix, pouvoir
-- ajouter des types de main d'œuvre avec leur prix (électricité, diagnostic…) et les supprimer.
-- Les quatre taux de base (poids lourds, VUL, remorque, tôlerie) restent : ils donnent le taux
-- par défaut d'un véhicule et la catégorie des lignes. Un type ajouté n'a pas de catégorie ;
-- sa ligne de main d'œuvre garde la catégorie du véhicule et le prix du type choisi.
-- =============================================================================

alter table public.labor_rates add column id uuid not null default gen_random_uuid();
alter table public.labor_rates drop constraint labor_rates_pkey;
alter table public.labor_rates add primary key (id);
alter table public.labor_rates alter column category drop not null;
alter table public.labor_rates add constraint labor_rates_category_key unique (category);
alter table public.labor_rates add column sort_order integer not null default 100;
alter table public.labor_rates
  add constraint labor_rates_label_check check (char_length(btrim(label)) between 1 and 40),
  add constraint labor_rates_line_label_check check (char_length(btrim(labor_line_label)) between 1 and 120);

update public.labor_rates set sort_order = case category
  when 'pl' then 1 when 'vul' then 2 when 'remorque' then 3 when 'tolerie' then 4 end;

comment on column public.labor_rates.category is
  'Taux de base d''une catégorie (pl, vul, remorque, tolerie) ; vide pour un type ajouté par la direction.';

-- Ajout et suppression par la direction ; les taux de base ne se suppriment pas
create policy labor_rates_insert on public.labor_rates for insert to authenticated
  with check (public.is_direction() and category is null);
create policy labor_rates_delete on public.labor_rates for delete to authenticated
  using (public.is_direction() and category is null);
grant insert, delete on public.labor_rates to authenticated;
