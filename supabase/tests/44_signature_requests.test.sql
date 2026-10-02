-- =============================================================================
-- Signature de l'OR par le client : sur la borne (1 minute) ou par lien e-mail
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work) values
  ('50000000-0000-0000-0000-000000000051', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', E'Freins avant\nVidange'),
  ('50000000-0000-0000-0000-000000000052', '30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'Diagnostic'),
  ('50000000-0000-0000-0000-000000000053', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'Contrôle');

-- ---------------------------------------------------------------- Borne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select public.request_repair_order_signature('50000000-0000-0000-0000-000000000051', 'kiosk') as kiosk_request \gset
select is(:'kiosk_request'::jsonb ->> 'status', 'pending', 'Demande envoyée sur la borne');
select ok((:'kiosk_request'::jsonb ->> 'seconds_left')::int between 55 and 60, 'Valable 1 minute');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.request_repair_order_signature('50000000-0000-0000-0000-000000000051', 'kiosk') $$,
  '42501', null, 'Seul le bureau demande une signature');
select throws_ok($$ select public.kiosk_pending_signature() $$, '42501', null, 'La demande ne s''affiche que sur la borne');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select public.kiosk_pending_signature() as pending \gset
select results_eq(
  $$ select x ->> 'vehicle_plate', x ->> 'client_name', x ->> 'requested_work' from (select public.kiosk_pending_signature() x) s $$,
  $$ values ('AB-123-CD', 'Transports Dupont', E'Freins avant\nVidange') $$,
  'La borne affiche le véhicule, le client et les travaux');
select throws_ok(format($$ select public.kiosk_sign_repair_order(%L, 'Paul Dupont', null) $$, :'pending'::jsonb ->> 'id'),
  '22023', 'Signez dans le cadre prévu', 'Signature obligatoire');
select pg_temp.fake_file('signature') as sig \gset
select lives_ok(format($$ select public.kiosk_sign_repair_order(%L, 'Paul Dupont', %L) $$, :'pending'::jsonb ->> 'id', :'sig'),
  'Le client signe sur la borne');
select is(public.kiosk_pending_signature(), null, 'Plus rien à afficher sur la borne');

reset role;
select is((select customer_signature_file_id from public.repair_orders where id = '50000000-0000-0000-0000-000000000051'),
          :'sig'::uuid, 'Signature gardée sur l''OR');
select ok(exists (select 1 from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000000051'
                  and label = 'Signé par le client sur la borne : Paul Dupont'), 'Historique de l''OR');
select is((select count(*)::int from public.notifications where type = 'signature_received'
           and repair_order_id = '50000000-0000-0000-0000-000000000051'), 2, 'Direction et réception prévenues');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.request_repair_order_signature('50000000-0000-0000-0000-000000000051', 'email') $$,
  'P0001', 'Le client a déjà signé cet OR', 'Pas de nouvelle demande sur un OR signé');

-- ---------------------------------------------------------------- Borne : délai passé
select public.request_repair_order_signature('50000000-0000-0000-0000-000000000053', 'kiosk') as late \gset
reset role;
update public.signature_requests set expires_at = now() - interval '1 minute' where id = (:'late'::jsonb ->> 'id')::uuid;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is(public.repair_order_signature_request('50000000-0000-0000-0000-000000000053') ->> 'status', 'expired',
          'Pas signé dans la minute : demande expirée pour le bureau');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
select is(public.kiosk_pending_signature(), null, 'La fenêtre a disparu de la borne');
select pg_temp.fake_file('signature') as late_sig \gset
select throws_ok(format($$ select public.kiosk_sign_repair_order(%L, '', %L) $$, :'late'::jsonb ->> 'id', :'late_sig'),
  'P0001', 'Demande de signature expirée : demandez à l''accueil de la relancer', 'Signature refusée après le délai');

-- ---------------------------------------------------------------- Lien e-mail
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.request_repair_order_signature('50000000-0000-0000-0000-000000000052', 'email') as mail \gset
select is(public.request_repair_order_signature('50000000-0000-0000-0000-000000000052', 'email') ->> 'token',
          :'mail'::jsonb ->> 'token', 'Lien encore valable : le même lien est repris');

select pg_temp.act_as_anon();
select results_eq(
  format($$ select d ->> 'type', d ->> 'status', d ->> 'vehicle_plate', d ->> 'client_name'
            from (select public.public_get_document(%L) d) s $$, :'mail'::jsonb ->> 'token'),
  $$ values ('signature', 'pending', 'IJ-789-KL', 'Logistique Martin') $$,
  'Le lien ouvre la demande de signature de l''OR');

reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.fake_file('signature') as mail_sig \gset
select throws_ok(format($$ select public.public_sign_repair_order(%L, ' ', %L) $$, :'mail'::jsonb ->> 'token', :'mail_sig'),
  '22023', 'Indiquez votre nom', 'Nom obligatoire en ligne');
select is((public.public_sign_repair_order(:'mail'::jsonb ->> 'token', 'Marie Martin', :'mail_sig')) ->> 'status', 'signed',
          'Le client absent signe en ligne');
select pg_temp.act_as_anon();
select is(public.public_get_document(:'mail'::jsonb ->> 'token') ->> 'status', 'signed', 'Le lien affiche « signé »');

select * from finish();
rollback;
