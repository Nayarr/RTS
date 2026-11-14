-- =============================================================================
-- Relance automatique des impayés : échéance selon le type de compte, un envoi par client,
-- 6 jours entre deux relances, 3 relances puis « à appeler », exclusions
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir helpers/fixtures.psql

select public.paris_date(now()) as today \gset

set local session_replication_role = replica;
insert into public.clients (id, name, email, account_type, direct_debit_day) values
  ('20000000-0000-0000-0000-000000000151', 'Prélevé le 5', 'compta@preleve.fr', 'prelevement', 5),
  ('20000000-0000-0000-0000-000000000152', 'Quinzaine', 'compta@quinzaine.fr', 'quinzaine', null),
  ('20000000-0000-0000-0000-000000000153', 'En litige', 'compta@litige.fr', 'comptant', null);
update public.clients set no_auto_reminders = true where id = '20000000-0000-0000-0000-000000000153';
insert into public.invoices (id, number, status, client_id, client_name, issued_at, due_date, total_ht, total_vat, total_ttc) values
  -- Dupont (comptant) : échue hier, et une autre échue il y a 10 jours
  ('80000000-0000-0000-0000-000000000151', 'F90151', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   now() - interval '1 day', :'today'::date - 1, 100, 20, 120),
  ('80000000-0000-0000-0000-000000000152', 'F90152', 'issued', '20000000-0000-0000-0000-000000000001', 'Transports Dupont',
   now() - interval '10 days', :'today'::date - 10, 50, 10, 60),
  -- Prélevé le 5 : prélèvement il y a 3 jours (trop tôt), il y a 6 jours (relancée)
  ('80000000-0000-0000-0000-000000000153', 'F90153', 'issued', '20000000-0000-0000-0000-000000000151', 'Prélevé le 5',
   now() - interval '20 days', :'today'::date - 3, 100, 20, 120),
  ('80000000-0000-0000-0000-000000000154', 'F90154', 'issued', '20000000-0000-0000-0000-000000000151', 'Prélevé le 5',
   now() - interval '30 days', :'today'::date - 6, 100, 20, 120),
  -- Quinzaine : échue il y a 2 jours (trop tôt)
  ('80000000-0000-0000-0000-000000000155', 'F90155', 'issued', '20000000-0000-0000-0000-000000000152', 'Quinzaine',
   now() - interval '10 days', :'today'::date - 2, 100, 20, 120),
  -- Client « ne pas relancer »
  ('80000000-0000-0000-0000-000000000156', 'F90156', 'issued', '20000000-0000-0000-0000-000000000153', 'En litige',
   now() - interval '30 days', :'today'::date - 20, 100, 20, 120),
  -- Martin : pas d'e-mail
  ('80000000-0000-0000-0000-000000000157', 'F90157', 'issued', '20000000-0000-0000-0000-000000000002', 'Logistique Martin',
   now() - interval '30 days', :'today'::date - 20, 100, 20, 120);
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Préparation
select public.prepare_overdue_reminders() as batch \gset
select results_eq(
  format($$ select x ->> 'client_name', (x ->> 'level')::int, jsonb_array_length(x -> 'invoices'), (x ->> 'balance')::numeric
            from jsonb_array_elements(%L::jsonb) x order by 1 $$, :'batch'),
  $$ values ('Prélevé le 5'::text, 1, 1, 120.00::numeric), ('Transports Dupont', 1, 2, 180.00) $$,
  'Un envoi par client : Dupont (2 factures), prélèvement passé de plus de 5 jours ; quinzaine, litige et sans e-mail écartés');
select is((select x ->> 'to' from jsonb_array_elements(:'batch'::jsonb) x where x ->> 'client_name' = 'Transports Dupont'),
          'compta@dupont.fr', 'Adresse du client');
select ok((select bool_and(i ->> 'token' is not null) from jsonb_array_elements(:'batch'::jsonb) x,
                  jsonb_array_elements(x -> 'invoices') i),
          'Chaque facture a son lien public');
select ok(exists (select 1 from public.notifications where type = 'overdue_no_email'
                  and dedupe_key like 'overdue-no-email-20000000-0000-0000-0000-000000000002-%'),
          'Client sans e-mail signalé à la direction');

-- Facture marquée « ne pas relancer »
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.set_invoice_auto_reminders('80000000-0000-0000-0000-000000000154', false) $$,
                 '42501', null, 'Le technicien ne règle pas la relance');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.set_invoice_auto_reminders('80000000-0000-0000-0000-000000000154', false);
reset role;
select is((select count(*)::int from jsonb_array_elements(public.prepare_overdue_reminders()) x
           where x ->> 'client_name' = 'Prélevé le 5'), 0, 'Facture « ne pas relancer » : plus d''envoi');

-- ---------------------------------------------------------------- Envoi noté
select public.record_overdue_reminder(array['80000000-0000-0000-0000-000000000151',
                                            '80000000-0000-0000-0000-000000000152']::uuid[], 1::smallint);
select is((select count(*)::int from public.invoice_reminders where auto_level = 1
           and invoice_id in ('80000000-0000-0000-0000-000000000151', '80000000-0000-0000-0000-000000000152')), 2,
          'Relance notée sur chaque facture');
select is((select count(*)::int from jsonb_array_elements(public.prepare_overdue_reminders()) x
           where x ->> 'client_name' = 'Transports Dupont'), 0, 'Moins de 6 jours après : pas de nouvelle relance');

-- Une semaine plus tard : 2e niveau
update public.invoice_reminders set sent_at = now() - interval '7 days' where auto_level = 1;
select is((select (x ->> 'level')::int from jsonb_array_elements(public.prepare_overdue_reminders()) x
           where x ->> 'client_name' = 'Transports Dupont'), 2, 'Semaine suivante : relance ferme (niveau 2)');

-- 3 relances sans règlement : plus d'envoi, la direction appelle
insert into public.invoice_reminders (invoice_id, sent_at, auto_level) values
  ('80000000-0000-0000-0000-000000000151', now() - interval '14 days', 2),
  ('80000000-0000-0000-0000-000000000151', now() - interval '7 days', 3);
select is((select jsonb_array_length(x -> 'invoices') from jsonb_array_elements(public.prepare_overdue_reminders()) x
           where x ->> 'client_name' = 'Transports Dupont'), 1, 'Facture relancée 3 fois retirée de l''envoi');
select ok(exists (select 1 from public.notifications where dedupe_key = 'overdue-call-80000000-0000-0000-0000-000000000151'),
          'Direction prévenue : client à appeler');

-- ---------------------------------------------------------------- Résumé et déclenchement
select public.finish_overdue_reminders(2, 300, 0);
select ok(exists (select 1 from public.notifications where type = 'overdue_summary'
                  and title = 'Relance des impayés : 2 clients'), 'Résumé du lundi à la direction');
update public.app_settings set overdue_reminders_enabled = false;
select is(public.run_overdue_reminders(), null, 'Relance désactivée (ou pas lundi 9 h) : rien n''est appelé');

select * from finish();
rollback;
