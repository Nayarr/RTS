-- =============================================================================
-- Espace client en ligne : lien, contenu vu par le client (sans compte), changement de lien
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données (hors règles métier)
set local session_replication_role = replica;
update public.vehicles set ct_due_date = '2026-12-01' where id = '30000000-0000-0000-0000-000000000001';
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000000001', 'OR90001', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', 'in_progress'),
  -- Véhicule d'un autre client : jamais visible
  ('50000000-0000-0000-0000-000000000003', 'OR90003', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Vidange', 'in_progress');
insert into public.quotes (id, number, status, client_id, vehicle_id, public_token, sent_at) values
  ('60000000-0000-0000-0000-000000000001', 'DV90001', 'sent', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', repeat('q', 40), now()),
  ('60000000-0000-0000-0000-000000000002', 'DV90002', 'draft', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', null, null);
insert into public.invoices (id, number, status, client_id, client_name, vehicle_label, issued_at, due_date, total_ht, total_vat, total_ttc) values
  ('80000000-0000-0000-0000-00000000000a', 'F90001', 'issued', '20000000-0000-0000-0000-000000000001',
   'Transports Dupont', 'AB-123-CD', now(), current_date + 30, 100, 20, 120),
  ('80000000-0000-0000-0000-00000000000b', 'F90002', 'issued', '20000000-0000-0000-0000-000000000002',
   'Logistique Martin', 'IJ-789-KL', now(), current_date + 30, 50, 10, 60);
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Lien créé par le bureau
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.share_client_portal('20000000-0000-0000-0000-000000000001') as token \gset
select is(public.share_client_portal('20000000-0000-0000-0000-000000000001'), :'token',
          'Lien permanent : le même à chaque envoi');

-- ---------------------------------------------------------------- Ce que voit le client (sans compte)
select pg_temp.act_as_anon();
select public.public_get_document(:'token') as portal \gset
select is(:'portal'::jsonb ->> 'type', 'portal', 'Le lien ouvre l''espace client');
select is(:'portal'::jsonb ->> 'client_name', 'Transports Dupont', 'Nom du client');
select is(jsonb_path_query_array(:'portal'::jsonb, '$.vehicles[*].plate'), '["AB-123-CD", "EF-456-GH"]'::jsonb,
          'Ses véhicules seulement (fiche client ou OR), jamais ceux d''un autre client');
select is(jsonb_path_query_array(:'portal'::jsonb, '$.vehicles[*].status_label'), '["En cours", "Pas à l''atelier"]'::jsonb,
          'État de chaque véhicule à l''atelier');
select is(:'portal'::jsonb #>> '{vehicles,0,ct_due_date}', '2026-12-01', 'Échéance de contrôle technique');
select is(jsonb_path_query_array(:'portal'::jsonb, '$.quotes[*].number'), '["DV90001"]'::jsonb,
          'Devis à signer : seulement les devis envoyés');
select is(jsonb_path_query_array(:'portal'::jsonb, '$.invoices[*].number'), '["F90001"]'::jsonb, 'Ses factures seulement');
select ok(length(:'portal'::jsonb #>> '{invoices,0,token}') >= 32, 'Chaque facture reçoit son lien de consultation');

-- ---------------------------------------------------------------- Changement de lien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.reset_client_portal('20000000-0000-0000-0000-000000000001') as new_token \gset
select pg_temp.act_as_anon();
select is(public.public_get_document(:'token'), null, 'L''ancien lien ne fonctionne plus');
select throws_ok($$ select public.reset_client_portal('20000000-0000-0000-0000-000000000001') $$,
                 '42501', null, 'Un visiteur ne change pas le lien');

select * from finish();
rollback;
