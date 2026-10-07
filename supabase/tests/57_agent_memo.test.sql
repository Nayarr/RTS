-- =============================================================================
-- Mémo de la direction pour l'Agent Direction : vide par défaut, 4 000 caractères au plus,
-- modifiable par la direction seulement
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

select is((select agent_memo from public.app_settings), '', 'Mémo vide par défaut');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
update public.app_settings set agent_memo = 'Karim est chef d''atelier.' where id;
select is((select agent_memo from public.app_settings), 'Karim est chef d''atelier.', 'Direction : mémo enregistré');
select throws_ok($$update public.app_settings set agent_memo = repeat('a', 4001) where id$$, '23514', null,
                 'Mémo limité à 4 000 caractères');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.app_settings set agent_memo = 'modifié' where id;
reset role;
select is((select agent_memo from public.app_settings), 'Karim est chef d''atelier.', 'Réception : mémo inchangé');

select * from finish();
rollback;
