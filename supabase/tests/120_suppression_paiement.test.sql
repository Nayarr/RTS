-- =============================================================================
-- Erreur sur un paiement : annulation par écriture inverse (direction seule, solde recalculé),
-- jamais de suppression ni de modification, et historique des règlements
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction

insert into public.repair_orders (id, vehicle_id, requested_work)
values ('50000000-0000-0000-0000-000000000120', '30000000-0000-0000-0000-000000000001', 'Freinage');
insert into public.ro_lines (repair_order_id, kind, line_type, description, estimated_hours)
values ('50000000-0000-0000-0000-000000000120', 'done', 'labor', 'Contrôle freinage', 2);
select public.build_invoice_draft(array['50000000-0000-0000-0000-000000000120'::uuid]) as invoice \gset
select public.issue_invoice(:'invoice');
select total_ttc as total from public.invoices where id = :'invoice' \gset

-- Saisie : la réception enregistre, l'historique garde le montant et la personne
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
insert into public.payments (id, invoice_id, amount_ttc, method, note) values
  ('70000000-0000-0000-0000-000000000120', :'invoice', :'total', 'card', 'Ticket 12');

select is((select payment_status from public.v_invoice_balances where invoice_id = :'invoice'), 'paid',
          'Facture soldée avant l''annulation');
select results_eq(
  format($$ select kind, amount_ttc, method::text, note, reason, actor_id::text from public.payment_events where invoice_id = %L $$, :'invoice'),
  format($$ values ('recorded'::text, %L::numeric, 'card'::text, 'Ticket 12'::text, null::text, '00000000-0000-0000-0000-0000000000e1'::text) $$, :'total'),
  'Paiement saisi inscrit à l''historique, avec son montant et la personne');

-- Réception : ni suppression, ni annulation
with d as (delete from public.payments where id = '70000000-0000-0000-0000-000000000120' returning 1)
select is(count(*), 0::bigint, 'La réception ne supprime pas le paiement') from d;
select throws_ok($$ select public.cancel_payment('70000000-0000-0000-0000-000000000120', 'Essai') $$,
                 '42501', null, 'cancel_payment refusée à la réception');
select is((select count(*) from public.payment_events where invoice_id = :'invoice'), 1::bigint,
          'Une annulation refusée n''écrit rien à l''historique');

-- Direction : annulation avec motif, le paiement reste, une écriture inverse s'ajoute
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
with d as (delete from public.payments where id = '70000000-0000-0000-0000-000000000120' returning 1)
select is(count(*), 0::bigint, 'Même la direction ne supprime pas un paiement') from d;
-- Hors de l'API (accès direct à la base) : le déclencheur refuse aussi
reset role;
select throws_ok($$ update public.payments set amount_ttc = 1 where id = '70000000-0000-0000-0000-000000000120' $$,
                 '42501', null, 'Ni personne ne le modifie, même hors de l''API');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.cancel_payment('70000000-0000-0000-0000-000000000120', '  Erreur de mode ') as reversal \gset
select is((select count(*) from public.payments where invoice_id = :'invoice'), 2::bigint,
          'Le paiement d''origine reste, avec son annulation');
select results_eq(
  format($$ select amount_ttc, method::text, paid_on, reverses_payment_id::text, cancel_reason, recorded_by::text
            from public.payments where id = %L $$, :'reversal'),
  format($$ values (-%s::numeric, 'card'::text, public.paris_date(now()),
                    '70000000-0000-0000-0000-000000000120'::text, 'Erreur de mode'::text,
                    '00000000-0000-0000-0000-0000000000d1'::text) $$, :'total'),
  'Annulation : montant opposé, même mode, datée du jour, liée au paiement, motif et personne');
select is((select paid_ttc from public.v_invoice_balances where invoice_id = :'invoice'), 0::numeric,
          'Plus rien de payé');
select is((select balance_due from public.v_invoice_balances where invoice_id = :'invoice'), :'total'::numeric,
          'Le reste dû revient au total');
select isnt((select payment_status from public.v_invoice_balances where invoice_id = :'invoice'), 'paid',
            'La facture n''est plus payée');
select results_eq(
  format($$ select amount_ttc, method::text, note, reason, actor_id::text from public.payment_events where invoice_id = %L and kind = 'cancelled' $$, :'invoice'),
  format($$ values (%L::numeric, 'card'::text, 'Annulation du paiement du ' || to_char(public.paris_date(now()), 'DD/MM/YYYY'), 'Erreur de mode'::text, '00000000-0000-0000-0000-0000000000d1'::text) $$, :'total'),
  'Annulation inscrite à l''historique : montant, mode, motif et personne');
select throws_ok($$ select public.cancel_payment('70000000-0000-0000-0000-000000000120') $$,
                 'P0001', 'Ce paiement est déjà annulé', 'Pas de seconde annulation');
select throws_ok(format($$ select public.cancel_payment(%L) $$, :'reversal'),
                 'P0001', null, 'Une annulation ne s''annule pas');
select throws_ok(format($$ insert into public.payments (invoice_id, amount_ttc, method, reverses_payment_id)
                           values (%L, -10, 'cash', '70000000-0000-0000-0000-000000000120') $$, :'invoice'),
                 '42501', null, 'Pas d''annulation saisie directement');

-- Sans motif ; l'ancien nom delete_payment annule aussi (le temps du déploiement de l'appli)
insert into public.payments (id, invoice_id, amount_ttc, method) values
  ('70000000-0000-0000-0000-000000000121', :'invoice', 10, 'cash');
select public.delete_payment('70000000-0000-0000-0000-000000000121');
select is((select reason from public.payment_events where payment_id = '70000000-0000-0000-0000-000000000121' and kind = 'cancelled'),
          null, 'Motif facultatif');
select is((select count(*) from public.payments where id = '70000000-0000-0000-0000-000000000121'), 1::bigint,
          'delete_payment n''efface plus : il annule');

-- Historique en lecture seule, même pour la direction
select throws_ok(format($$ insert into public.payment_events (invoice_id, payment_id, kind, amount_ttc, method, paid_on)
                           values (%L, gen_random_uuid(), 'recorded', 1, 'cash', current_date) $$, :'invoice'),
                 '42501', null, 'Pas d''écriture directe dans l''historique');
select throws_ok($$ delete from public.payment_events $$, '42501', null, 'Pas de suppression dans l''historique');
select throws_ok($$ update public.payment_events set reason = 'x' $$, '42501', null, 'Pas de modification de l''historique');

-- Technicien : pas d'accès
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is((select count(*) from public.payment_events), 0::bigint, 'Historique invisible hors du bureau');

select * from finish();
rollback;
