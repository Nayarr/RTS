-- =============================================================================
-- Point du jour de l'Agent Direction : un par personne et par jour, lu par son auteur
-- (direction) seulement, écrit par l'Edge Function seulement, purgé après 90 jours
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

-- Points écrits par l'Edge Function (rôle de service)
insert into public.agent_briefings (profile_id, day, text, tools) values
  ('00000000-0000-0000-0000-0000000000d1', current_date, 'Rien d''urgent ce matin.', '{tableau_de_bord}'),
  ('00000000-0000-0000-0000-0000000000d1', current_date - 91, 'Ancien point.', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', current_date, 'Point de la réception.', '{}');

select throws_ok(
  $$insert into public.agent_briefings (profile_id, day, text)
    values ('00000000-0000-0000-0000-0000000000d1', current_date, 'Doublon')$$,
  '23505', null, 'Un seul point par personne et par jour');
select throws_ok(
  $$insert into public.agent_briefings (profile_id, day, text)
    values ('00000000-0000-0000-0000-0000000000d1', current_date + 1, '')$$,
  '23514', null, 'Point jamais vide');

-- ---------------------------------------------------------------- Direction
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::int from public.agent_briefings), 2, 'Direction : ses points seulement');
select is((select text from public.agent_briefings where day = current_date), 'Rien d''urgent ce matin.',
          'Direction : point du jour lisible');
select throws_ok(
  $$insert into public.agent_briefings (profile_id, day, text)
    values ('00000000-0000-0000-0000-0000000000d1', current_date + 2, 'x')$$,
  '42501', null, 'Point écrit par l''Edge Function seulement');
select throws_ok($$update public.agent_briefings set text = 'x'$$, '42501', null, 'Pas de modification');

-- ---------------------------------------------------------------- Autres rôles
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select results_eq($$select text from public.agent_briefings$$, $$values ('Point de la réception.')$$,
                  'Réception : son point du jour seulement');
select pg_temp.act_as_anon();
select throws_ok('select id from public.agent_briefings', '42501', null, 'Visiteur : refusé');
reset role;

-- ---------------------------------------------------------------- Purge
select public.purge_agent_conversations();
select is((select count(*)::int from public.agent_briefings), 2, 'Point de plus de 90 jours effacé la nuit');

select * from finish();
rollback;
