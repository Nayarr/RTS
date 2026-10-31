-- =============================================================================
-- Agenda personnel : chacun ses rendez-vous, personne d'autre ne les voit
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

-- Réception : un rendez-vous dans son agenda
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ insert into public.personal_events (id, title, starts_at, ends_at, location)
                   values ('80000000-0000-0000-0000-000000000001', 'Rendez-vous banque',
                           '2026-11-02 10:00+01', '2026-11-02 11:00+01', 'Roissy') $$,
                'La réception pose un rendez-vous dans son agenda');
select is((select profile_id from public.personal_events where id = '80000000-0000-0000-0000-000000000001'),
          '00000000-0000-0000-0000-0000000000e1'::uuid, 'Rattaché au compte connecté');
select throws_ok($$ insert into public.personal_events (profile_id, title, starts_at, ends_at)
                    values ('00000000-0000-0000-0000-0000000000d1', 'Pour la direction', now(), now() + interval '1 hour') $$,
                 '42501', null, 'Impossible de poser un rendez-vous dans l''agenda d''un autre');
select throws_ok($$ insert into public.personal_events (title, starts_at, ends_at)
                    values ('À l''envers', '2026-11-02 11:00+01', '2026-11-02 10:00+01') $$,
                 '23514', null, 'La fin suit le début');

-- Direction : ne voit ni ne modifie l'agenda de la réception
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select is((select count(*)::integer from public.personal_events), 0, 'La direction ne voit pas l''agenda de la réception');
update public.personal_events set title = 'Modifié' where id = '80000000-0000-0000-0000-000000000001';
delete from public.personal_events where id = '80000000-0000-0000-0000-000000000001';
reset role;
select is((select title from public.personal_events where id = '80000000-0000-0000-0000-000000000001'),
          'Rendez-vous banque', 'ni ne le modifie, ni ne le supprime');

-- Technicien : pas d'agenda (bureau seulement)
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ insert into public.personal_events (title, starts_at, ends_at)
                    values ('Atelier', now(), now() + interval '1 hour') $$,
                 '42501', null, 'Agenda réservé aux comptes du bureau');

-- Réception : modifie puis supprime le sien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
update public.personal_events set title = 'Banque (reporté)' where id = '80000000-0000-0000-0000-000000000001';
select is((select title from public.personal_events where id = '80000000-0000-0000-0000-000000000001'),
          'Banque (reporté)', 'La réception modifie son rendez-vous');
delete from public.personal_events where id = '80000000-0000-0000-0000-000000000001';
select is((select count(*)::integer from public.personal_events), 0, 'puis le supprime');

select * from finish();
rollback;
