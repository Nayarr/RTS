-- =============================================================================
-- Devis : création sans OR, depuis un OR, réponse du client, devis accepté figé
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Devis sans OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as standalone from public.create_quote(' transports dupont ', 'ab 123 cd', 'vul') \gset
select results_eq(
  format($$ select client_id, vehicle_id, vehicle_type::text, status::text, number from public.quotes where id = %L $$,
         :'standalone'),
  $$ values ('20000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000001'::uuid,
             'pl', 'draft', null::text) $$,
  'Client et véhicule existants retrouvés ; le type vient du véhicule connu');

select id as walk_in from public.create_quote('Garage Nouveau', null, 'vul') \gset
select results_eq(
  format($$ select q.vehicle_id is null, c.name from public.quotes q join public.clients c on c.id = q.client_id
            where q.id = %L $$, :'walk_in'),
  $$ values (true, 'Garage Nouveau') $$,
  'Un devis sans immatriculation crée le client à la volée');

select throws_ok($$ select public.create_quote('  ') $$, '22023', 'Indique le client', 'Le client est obligatoire');

select throws_ok(format($$ select public.set_quote_response(%L, 'accepted') $$, :'standalone'),
                 'P0001', 'Le devis est vide', 'Un devis vide ne peut pas être accepté');

insert into public.quote_lines (quote_id, line_type, description, unit_price, quantity)
values (:'standalone', 'labor', 'Remplacement plaquettes', 90, 2);
select is((select status::text from public.quotes where id = :'standalone'), 'in_progress',
          'Une ligne ajoutée fait passer le devis « En cours »');
select is((select total_ttc from public.v_quotes_overview where id = :'standalone'), 216.00::numeric,
          'Totaux du devis dans la vue de liste (180 € HT + TVA)');

-- ---------------------------------------------------------------- Réponse du client
select is((public.set_quote_response(:'standalone', 'refused')).status::text, 'refused', 'Refus enregistré');
select isnt((select number from public.quotes where id = :'standalone'), null,
            'Le devis reçoit son numéro au plus tard à la réponse du client');
select throws_ok(format($$ select public.set_quote_response(%L, 'accepted') $$, :'standalone'),
                 'P0001', 'Le client a déjà répondu à ce devis', 'Pas de seconde réponse sans réouverture');
select is((public.set_quote_response(:'standalone', 'in_progress')).status::text, 'in_progress',
          'Un devis refusé peut être rouvert');
select is((public.set_quote_response(:'standalone', 'accepted')).status::text, 'accepted', 'Accord enregistré');

select throws_ok(format($$ update public.quote_lines set unit_price = 1 where quote_id = %L $$, :'standalone'),
                 '42501', 'Devis accepté : il ne peut plus être modifié', 'Un devis accepté est figé');
select throws_ok(format($$ insert into public.quote_lines (quote_id, description) values (%L, 'Ajout') $$, :'standalone'),
                 '42501', null, 'Aucune ligne ne s''ajoute à un devis accepté');

-- L'OR créé à partir du devis reprend ses lignes (création système malgré le verrou)
select lives_ok(format($$ select public.create_repair_order_from_quote(%L, null) $$, :'standalone'),
                'Le devis accepté se transforme en OR');

-- ---------------------------------------------------------------- Devis d'un OR : historique
insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Freins');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000001', 'planned', 'labor', 'Disques avant', 3);
select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000001') as ro_quote \gset
select public.set_quote_response(:'ro_quote', 'accepted');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000000001'
                  and label like 'Devis DV% accepté par le client'),
          'L''accord du client est tracé dans l''historique de l''OR');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.create_quote('Pirate') $$, '42501', null, 'Un technicien ne crée pas de devis');

select * from finish();
rollback;
