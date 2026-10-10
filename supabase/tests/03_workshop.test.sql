-- =============================================================================
-- Flux atelier : badgeage, photos obligatoires, fiche de contrôle -> forfaits,
-- mots-clés, clôture, devis en ligne, OR issu du devis, stock des consommables
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir helpers/fixtures.psql

insert into public.service_packages (id, name, category, standard_hours, price, trigger_fields, keywords) values
  ('80000000-0000-0000-0000-000000000001', 'Forfait freinage avant PL', 'pl', 3, 340, array['plaquettes_avant', 'disques_avant'], '{}'),
  ('80000000-0000-0000-0000-000000000002', 'Forfait vidange PL', 'pl', 1.5, 180, '{}', array['vidange']);
insert into public.consumables (id, name, unit, sale_price, purchase_price, stock_qty) values
  ('90000000-0000-0000-0000-000000000001', 'Huile 10W40', 'L', 8, 4, 100);
insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Entretien', '10000000-0000-0000-0000-0000000000a1');

-- ---------------------------------------------------------------- Technicien : démarrage
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
\set ro '''50000000-0000-0000-0000-000000000001'''

select throws_like($$ select public.start_timer('50000000-0000-0000-0000-000000000001') $$,
                   '%Photos manquantes%', 'Kilométrage facultatif : seules les photos manquantes bloquent');

select lives_ok($$ select public.tech_update_repair_order('50000000-0000-0000-0000-000000000001', '{"mileage": 184320}') $$,
                'Le technicien renseigne le kilométrage');
select is((select status from public.repair_orders where id = :ro), 'in_progress'::public.repair_order_status,
          'Le travail du technicien passe l''OR « En cours »');

select throws_like($$ select public.start_timer('50000000-0000-0000-0000-000000000001') $$,
                   '%Photos manquantes%Tableau de bord%', 'Badgeage impossible sans les 5 photos obligatoires');

insert into public.ro_photos (repair_order_id, file_id, label)
select :ro, pg_temp.fake_file('ro_photo'), l
from unnest(array['Face avant', 'Côté gauche', 'Côté droit', 'Arrière', 'Tableau de bord']) l;

select lives_ok($$ select public.start_timer('50000000-0000-0000-0000-000000000001') $$, 'Badgeage démarré');
select throws_like($$ select public.start_timer('50000000-0000-0000-0000-000000000001') $$,
                   '%déjà en cours%', 'Un seul chrono ouvert par OR');
select isnt((select running_since from public.v_repair_order_time where repair_order_id = :ro), null,
            'Le chrono en cours est visible');
select lives_ok($$ select public.stop_timer('50000000-0000-0000-0000-000000000001') $$, 'Badgeage mis en pause');

-- ---------------------------------------------------------------- Fiche de contrôle -> forfaits
insert into public.inspections (repair_order_id, data)
values (:ro, '{"usure": {"plaquettes_avant": "HS"}, "controles": {"extincteur1": "HS"}}');

select results_eq(
  $$ select line_type::text, unit_price, standard_hours from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000001' and package_id is not null $$,
  $$ values ('package', 340.00::numeric, 3.00::numeric) $$,
  'Plaquettes avant HS : le forfait freinage est ajouté aux travaux à prévoir');
select results_eq(
  $$ select description, estimated_hours from public.ro_lines
     where repair_order_id = '50000000-0000-0000-0000-000000000001' and description like 'Remplacement%' $$,
  $$ values ('Remplacement Extincteur 1 kg cabine'::text, 0.30::numeric) $$,
  'Extincteur HS sans forfait : ligne « Remplacement … » avec son temps par défaut');

update public.inspections set data = '{"usure": {"plaquettes_avant": "OK"}, "controles": {"extincteur1": "HS"}}'
where repair_order_id = :ro;
select is((select count(*) from public.ro_lines where repair_order_id = :ro and package_id is not null), 0::bigint,
          'Case repassée à OK : le forfait est retiré');
select is((select count(*) from public.ro_lines where repair_order_id = :ro and description like 'Remplacement%'), 1::bigint,
          'Pas de doublon de ligne « Remplacement … »');

-- ---------------------------------------------------------------- Clôture
insert into public.ro_lines (repair_order_id, kind, description) values (:ro, 'done', 'Vidange moteur et filtres');
select throws_like($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000001') $$,
                   '%Temps réel manquant : 1 tâche des travaux effectués%', 'Clôture impossible sans temps sur chaque travail effectué');
update public.ro_lines set estimated_hours = 2 where repair_order_id = :ro and kind = 'done';
select lives_ok($$ select public.complete_repair_order('50000000-0000-0000-0000-000000000001', true) $$,
                'Le technicien termine l''intervention (devis nécessaire)');
select is((select status from public.repair_orders where id = :ro), 'quote_pending'::public.repair_order_status,
          'L''OR passe « Devis à faire »');
select throws_like($$ insert into public.ro_lines (repair_order_id, kind, description) values ('50000000-0000-0000-0000-000000000001', 'done', 'Oubli') $$,
                   '%row-level security%', 'OR terminé : verrouillé pour le technicien');

-- ---------------------------------------------------------------- Bureau : devis
reset role;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select lives_ok($$ select public.build_quote_from_repair_order('50000000-0000-0000-0000-000000000001') $$,
                'Le devis se construit depuis l''OR');
select is((select line_type::text from public.ro_lines where repair_order_id = :ro and kind = 'done'), 'package',
          'La ligne « vidange » est convertie en forfait par mot-clé');
select is((select count(*) from public.quote_lines ql join public.quotes q on q.id = ql.quote_id where q.repair_order_id = :ro),
          2::bigint, 'Le devis reprend les travaux effectués et à prévoir');

select isnt(public.share_quote((select id from public.quotes where repair_order_id = :ro)), null,
            'Le devis est envoyé avec un lien à signer');
select is((select number from public.quotes where repair_order_id = :ro), 'DV00001', 'Numéro de devis attribué à l''envoi');

-- Le client signe en ligne (appel fait par l'Edge Function avec la clé de service)
reset role;
set local role service_role;
select is(public.public_respond_quote((select public_token from public.quotes where repair_order_id = :ro), true, 'M. Dupont',
                                      pg_temp.fake_file('signature')) ->> 'status',
          'accepted', 'Le client accepte le devis en ligne');
reset role;
select is((select count(*) from public.notifications where type = 'quote_response'), 2::bigint,
          'La direction et la réception sont alertées');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok($$ select public.create_repair_order_from_quote((select id from public.quotes where repair_order_id = '50000000-0000-0000-0000-000000000001'), '10000000-0000-0000-0000-0000000000b1') $$,
                'Devis accepté : nouvel OR créé et assigné');
select results_eq(
  $$ select r.number, r.origin_repair_order_id, (select count(*) from public.ro_lines l where l.repair_order_id = r.id)
     from public.repair_orders r join public.quotes q on q.resulting_repair_order_id = r.id $$,
  $$ values ('OR00002'::text, '50000000-0000-0000-0000-000000000001'::uuid, 1::bigint) $$,
  'Le nouvel OR reprend les travaux acceptés et garde son origine');

-- ---------------------------------------------------------------- Consommables
insert into public.ro_consumables (repair_order_id, consumable_id, quantity) values (:ro, '90000000-0000-0000-0000-000000000001', 12);
select is((select stock_qty from public.consumables where id = '90000000-0000-0000-0000-000000000001'), 88.00::numeric,
          'Le stock est décrémenté à l''utilisation');
delete from public.ro_consumables where repair_order_id = :ro;
select is((select stock_qty from public.consumables where id = '90000000-0000-0000-0000-000000000001'), 100.00::numeric,
          'Le stock est rétabli si on retire le consommable');

select * from finish();
rollback;
