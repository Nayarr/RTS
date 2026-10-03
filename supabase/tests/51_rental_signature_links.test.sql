-- =============================================================================
-- Location — signature du contrat par lien e-mail et lien de consultation du contrat
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, mileage, license_category)
values ('60000000-0000-0000-0000-000000000051', 'GE-512-UV', 'Renault', 'Master', 'van', 95, 48210, 'B');
insert into public.clients (id, kind, first_name, last_name, name, email)
values ('20000000-0000-0000-0000-000000000051', 'individual', 'Julie', 'Martin', '', 'julie@exemple.fr');
insert into public.rentals (id, client_id, fleet_vehicle_id, departure_at, planned_return_at,
                            unit_price, periods, km_included, deposit, franchise)
values ('a0000000-0000-0000-0000-000000000051', '20000000-0000-0000-0000-000000000051',
        '60000000-0000-0000-0000-000000000051', '2026-11-05 09:30+01', '2026-11-07 18:00+01', 95, 2, 500, 1500, 800);

-- ---------------------------------------------------------------- Demande de signature
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select throws_ok($$ select public.request_rental_signature('a0000000-0000-0000-0000-000000000051') $$,
  '42501', null, 'Seul le bureau demande une signature');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.request_rental_signature('a0000000-0000-0000-0000-000000000051') as mail \gset
select is(:'mail'::jsonb ->> 'status', 'pending', 'Lien de signature préparé');
select ok((:'mail'::jsonb ->> 'expires_at')::timestamptz between now() + interval '6 days 23 hours'
                                                             and now() + interval '7 days 1 minute',
          'Valable 7 jours');
select is(public.request_rental_signature('a0000000-0000-0000-0000-000000000051') ->> 'token',
          :'mail'::jsonb ->> 'token', 'Lien encore valable : le même lien est repris');
select is(public.rental_signature_request('a0000000-0000-0000-0000-000000000051') ->> 'id',
          :'mail'::jsonb ->> 'id', 'Le bureau suit la demande');

-- ---------------------------------------------------------------- Lecture par le client
select pg_temp.act_as_anon();
select results_eq(
  format($$ select d ->> 'type', d ->> 'status', d ->> 'number', d ->> 'client_name', d -> 'vehicle' ->> 'plate',
                   (d -> 'conditions' ->> 'unit_price')::numeric, (d -> 'conditions' ->> 'franchise')::numeric
            from (select public.public_get_document(%L) d) s $$, :'mail'::jsonb ->> 'token'),
  $$ values ('rental_signature', 'pending', 'LC-2026-0001', 'Julie Martin', 'GE-512-UV', 95.00, 800.00) $$,
  'Le lien ouvre le contrat à signer : véhicule, client et conditions');
select ok(not (public.public_get_document(:'mail'::jsonb ->> 'token') ? 'driving_license_id'),
          'Le permis n''est jamais montré sur la page publique');
select throws_ok($$ select public.request_rental_signature('a0000000-0000-0000-0000-000000000051') $$,
  '42501', null, 'Un visiteur ne peut pas demander de signature');

-- ---------------------------------------------------------------- Signature en ligne (Edge Function)
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.fake_file('signature') as sig \gset
select throws_ok(format($$ select public.public_sign_link(%L, ' ', %L) $$, :'mail'::jsonb ->> 'token', :'sig'),
  '22023', 'Indiquez votre nom', 'Nom obligatoire');
select throws_ok(format($$ select public.public_sign_repair_order(%L, 'Julie Martin', %L) $$, :'mail'::jsonb ->> 'token', :'sig'),
  'P0002', 'Lien de signature inconnu', 'Le lien d''un contrat ne signe pas un OR');
select is(public.public_sign_link(:'mail'::jsonb ->> 'token', 'Julie Martin', :'sig') ->> 'status', 'signed',
          'Le client signe le contrat en ligne');
select results_eq(
  $$ select signature_file_id is not null, signed_at is not null, terms_accepted
     from public.rentals where id = 'a0000000-0000-0000-0000-000000000051' $$,
  $$ values (true, true, true) $$,
  'Signature gardée sur le contrat');
select is((select count(*)::int from public.notifications where type = 'signature_received'
           and link = '/location/contrats/a0000000-0000-0000-0000-000000000051'), 2, 'Direction et réception prévenues');
select throws_ok(format($$ select public.public_sign_link(%L, 'Julie Martin', %L) $$, :'mail'::jsonb ->> 'token',
                        pg_temp.fake_file('signature')),
  'P0001', 'Ce contrat est déjà signé', 'Une seule signature');

select pg_temp.act_as_anon();
select results_eq(
  format($$ select d ->> 'status', d ->> 'signer_name' from (select public.public_get_document(%L) d) s $$,
         :'mail'::jsonb ->> 'token'),
  $$ values ('signed', 'Julie Martin') $$,
  'Le lien affiche « signé » et le nom du signataire');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok($$ select public.request_rental_signature('a0000000-0000-0000-0000-000000000051') $$,
  'P0001', 'Le client a déjà signé ce contrat', 'Pas de nouvelle demande sur un contrat signé');

-- ---------------------------------------------------------------- Conditions modifiées après la signature
update public.rentals set notes = 'Clés au comptoir' where id = 'a0000000-0000-0000-0000-000000000051';
select ok((select signed_at is not null from public.rentals where id = 'a0000000-0000-0000-0000-000000000051'),
          'Une note ne retire pas la signature');
update public.rentals set unit_price = 89 where id = 'a0000000-0000-0000-0000-000000000051';
select results_eq(
  $$ select signature_file_id is null, signed_at is null, terms_accepted
     from public.rentals where id = 'a0000000-0000-0000-0000-000000000051' $$,
  $$ values (true, true, false) $$,
  'Tarif modifié avant le départ : le contrat est à signer de nouveau');

-- Nouveau lien, puis signature au comptoir : le lien est annulé.
select public.request_rental_signature('a0000000-0000-0000-0000-000000000051') as again \gset
select isnt(:'again'::jsonb ->> 'token', :'mail'::jsonb ->> 'token', 'Nouveau lien après le changement de tarif');
update public.rentals set signature_file_id = pg_temp.fake_file('signature'), signed_at = now(), terms_accepted = true
 where id = 'a0000000-0000-0000-0000-000000000051';
select is((select status::text from public.signature_requests where id = (:'again'::jsonb ->> 'id')::uuid), 'cancelled',
          'Signé au comptoir : le lien e-mail est annulé');

-- ---------------------------------------------------------------- Lien de consultation du contrat
select public.share_rental('a0000000-0000-0000-0000-000000000051') as contract \gset
select is(public.share_rental('a0000000-0000-0000-0000-000000000051'), :'contract', 'Le même lien est repris');
select pg_temp.act_as_anon();
select results_eq(
  format($$ select d ->> 'type', d ->> 'number', d ->> 'rental_status' from (select public.public_get_document(%L) d) s $$,
         :'contract'),
  $$ values ('rental', 'LC-2026-0001', 'reserved') $$,
  'Le client relit son contrat avec le lien');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.cancel_rental('a0000000-0000-0000-0000-000000000051');
select pg_temp.act_as_anon();
select is(public.public_get_document(:'contract'), null, 'Contrat annulé : le lien ne l''affiche plus');

-- ---------------------------------------------------------------- Contraintes
reset role;
select throws_ok($$
  insert into public.signature_requests (rental_id, repair_order_id, channel, public_token, expires_at)
  values ('a0000000-0000-0000-0000-000000000051', '50000000-0000-0000-0000-000000000001', 'email',
          public.generate_public_token(), now() + interval '1 day')
$$, '23514', null, 'Une demande vise un OR ou un contrat, pas les deux');

select * from finish();
rollback;
