-- =============================================================================
-- Mails reçus : nouvelles dates de contrôle proposées d'après le mail, appliquées par le bureau
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

reset role;
update public.vehicles set ct_due_date = current_date + 3 where id = '30000000-0000-0000-0000-000000000001';
update public.vehicles set tailgate_due_date = date_trunc('month', current_date)::date
 where id = '30000000-0000-0000-0000-000000000002';
insert into public.inbox_emails (id, provider_id, mailbox, from_address, subject, received_at, client_id) values
  ('90000000-0000-0000-0000-000000000107', 'e-107', 'atelier@rts.fr', 'compta@dupont.fr', 'CT et hayon faits', now(),
   '20000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000108', 'e-108', 'atelier@rts.fr', 'compta@dupont.fr', 'CT fait', now(),
   '20000000-0000-0000-0000-000000000001');

-- Relevé du tri (clé de service) : seules les dates cohérentes sont gardées
select is(public.propose_inbox_deadline_updates('90000000-0000-0000-0000-000000000107', jsonb_build_array(
  jsonb_build_object('immatriculation', 'ab 123 cd', 'controle', 'ct', 'date', current_date + 365),
  jsonb_build_object('immatriculation', 'EF-456-GH', 'controle', 'hayon', 'date', current_date + 300),
  -- Date passée, véhicule d'un autre client, plaque inconnue, date avant celle de la fiche
  jsonb_build_object('immatriculation', 'AB-123-CD', 'controle', 'ct', 'date', current_date - 5),
  jsonb_build_object('immatriculation', 'IJ-789-KL', 'controle', 'ct', 'date', current_date + 365),
  jsonb_build_object('immatriculation', 'ZZ-999-ZZ', 'controle', 'ct', 'date', current_date + 365),
  jsonb_build_object('immatriculation', 'EF-456-GH', 'controle', 'ct', 'date', 'demain'))), 2,
  'Contrôle technique et hayon gardés, le reste écarté');
select is((select deadline_updates #>> '{1,date}' from public.inbox_emails where id = '90000000-0000-0000-0000-000000000107'),
          to_char(date_trunc('month', current_date + 300), 'YYYY-MM-DD'), 'Hayon : au mois');
select is(public.propose_inbox_deadline_updates('90000000-0000-0000-0000-000000000108', jsonb_build_array(
  jsonb_build_object('immatriculation', 'AB-123-CD', 'controle', 'ct', 'date', current_date + 2))), 0,
  'Date avant celle de la fiche : rien à proposer');

-- Technicien : ni proposition ni décision
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.propose_inbox_deadline_updates('90000000-0000-0000-0000-000000000107', '[]') $$,
                 '42501', null, 'Proposition réservée au tri des mails');
select throws_ok($$ select public.decide_inbox_deadline_updates('90000000-0000-0000-0000-000000000107', true) $$,
                 '42501', null, 'Technicien : pas de mise à jour');

-- Réception : fiches mises à jour
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is((public.decide_inbox_deadline_updates('90000000-0000-0000-0000-000000000107', true)).deadline_updates_status,
          'applied', 'Mise à jour appliquée');
select is((select ct_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          current_date + 365, 'Contrôle technique de la fiche à la nouvelle date');
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000002'),
          date_trunc('month', current_date + 300)::date, 'Hayon de la fiche au nouveau mois');
select throws_like($$ select public.decide_inbox_deadline_updates('90000000-0000-0000-0000-000000000107', false) $$,
                   '%déjà traitée%', 'Une seule décision');

select * from finish();
rollback;
