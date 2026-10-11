-- =============================================================================
-- Sécurité : cloisonnement par rôle (RLS) et accès anonyme
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

\ir helpers/fixtures.psql

-- Deux OR : un pour Alice, un pour Bruno
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-000000000001', 'Vidange', '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-000000000003', 'Pneus',   '10000000-0000-0000-0000-0000000000b1');
insert into public.invoices (client_id) values ('20000000-0000-0000-0000-000000000001');
insert into public.quotes (id, client_id, vehicle_id, public_token, status)
values ('70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
        repeat('a', 64), 'sent');

-- ---------------------------------------------------------------- Technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');

select results_eq($$ select id from public.repair_orders $$,
                  $$ values ('50000000-0000-0000-0000-0000000000a1'::uuid) $$,
                  'Un technicien ne voit que ses OR');
select is((select count(*) from public.invoices), 0::bigint, 'Un technicien ne voit aucune facture');
select is((select count(*) from public.clients), 1::bigint, 'Un technicien ne voit que les clients de ses OR');
select is((select count(*) from public.technician_pins), 0::bigint, 'Les codes PIN ne sont jamais lisibles');
select is((select count(*) from public.kiosk_secrets), 0::bigint, 'Le code de sortie de la borne n''est pas lisible');

with u as (update public.repair_orders set requested_work = 'piraté' returning 1)
select is(count(*), 0::bigint, 'Un technicien ne peut pas modifier directement un OR') from u;

select lives_ok($$ insert into public.ro_lines (repair_order_id, kind, description, estimated_hours)
                   values ('50000000-0000-0000-0000-0000000000a1', 'done', 'Vidange moteur', 1) $$,
                'Un technicien ajoute des travaux sur son OR');
select throws_like($$ insert into public.ro_lines (repair_order_id, kind, description)
                      values ('50000000-0000-0000-0000-0000000000b1', 'done', 'Intrusion') $$,
                   '%row-level security%', 'Un technicien ne peut pas écrire sur l''OR d''un collègue');
select throws_like($$ insert into public.ro_lines (repair_order_id, kind, description, unit_price)
                      values ('50000000-0000-0000-0000-0000000000a1', 'done', 'Ligne chiffrée', 999) $$,
                   '%sans prix%', 'Un technicien ne peut pas saisir de prix');
select throws_like($$ update public.ro_lines set discount_percent = 50
                      where repair_order_id = '50000000-0000-0000-0000-0000000000a1' $$,
                   '%non autorisée%', 'Un technicien ne peut pas appliquer de remise');
select throws_like($$ select public.issue_invoice((select id from public.invoices limit 1)) $$,
                   '%réservé au bureau%', 'Un technicien ne peut pas émettre de facture');
select throws_like($$ select public.set_technician_pin('10000000-0000-0000-0000-0000000000a1', '1234') $$,
                   '%réservé à la direction%', 'Un technicien ne peut pas définir de code PIN');
select throws_like($$ select public.tech_update_repair_order('50000000-0000-0000-0000-0000000000b1', '{"mileage": 1}') $$,
                   '%pas assigné%', 'Un technicien ne peut pas modifier le kilométrage d''un OR qui n''est pas le sien');

-- ---------------------------------------------------------------- Réception
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select is((select count(*) from public.repair_orders), 2::bigint, 'La réception voit tous les OR');
select lives_ok($$ insert into public.parts (designation) values ('Filtre') $$,
                'La réception enregistre les pièces de ses devis');
delete from public.parts where designation = 'Filtre';
select is((select count(*) from public.parts where designation = 'Filtre'), 1::bigint,
          'Seule la direction supprime une pièce');
select is((select count(*) from public.clock_events), 0::bigint, 'La réception ne voit pas les pointages');

-- ---------------------------------------------------------------- Direction
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ insert into public.parts (designation, sale_price) values ('Filtre à huile', 25) $$,
                'La direction gère le catalogue pièces');

-- ---------------------------------------------------------------- Visiteur anonyme
reset role;
select pg_temp.act_as_anon();

select throws_like($$ select * from public.clients $$, '%permission denied%',
                   'Un visiteur anonyme ne peut lire aucune table');
select is(public.public_get_document(repeat('a', 64)) ->> 'type', 'quote',
          'Un visiteur anonyme ouvre le devis avec son lien');
select is(public.public_get_document(repeat('b', 64)), null, 'Un jeton inconnu ne renvoie rien');

select * from finish();
rollback;
