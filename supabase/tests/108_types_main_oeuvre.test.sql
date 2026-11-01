-- =============================================================================
-- Taux horaires : types de main d'œuvre ajoutés et supprimés par la direction
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

-- Direction : nouveau type, sans catégorie
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ insert into public.labor_rates (id, label, labor_line_label, hourly_rate)
                   values ('81000000-0000-0000-0000-000000000001', 'Électricité', 'Main d''œuvre électricité', 95) $$,
                'La direction ajoute un type de main d''œuvre');
select throws_ok($$ insert into public.labor_rates (category, label, labor_line_label, hourly_rate)
                    values ('pl', 'PL bis', 'MO', 90) $$, '42501', null,
                 'Pas de deuxième taux de base');

-- Réception : lecture seule
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((select hourly_rate from public.labor_rates where id = '81000000-0000-0000-0000-000000000001'), 95.00,
          'La réception voit le nouveau type (proposé à l''ajout de main d''œuvre)');
select throws_ok($$ insert into public.labor_rates (label, labor_line_label, hourly_rate) values ('X', 'X', 1) $$,
                 '42501', null, 'La réception n''ajoute pas de type');

-- Taux de base : ne se suppriment pas ; le type ajouté, si
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
delete from public.labor_rates where category = 'tolerie';
select is((select count(*)::integer from public.labor_rates where category is not null), 4,
          'Les quatre taux de base restent');
delete from public.labor_rates where id = '81000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.labor_rates where id = '81000000-0000-0000-0000-000000000001'), 0,
          'Le type ajouté se supprime');

-- Taux par défaut d'un véhicule inchangé
select is(public.labor_rate_for('20000000-0000-0000-0000-000000000002', 'vul'), 75.00,
          'Taux du type de véhicule toujours trouvé');

select * from finish();
rollback;
