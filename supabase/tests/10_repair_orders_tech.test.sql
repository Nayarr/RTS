-- =============================================================================
-- OR côté technicien : photos (ajout, suppression, fichier libéré), OR vus
-- (le parcours chrono / fiche de contrôle / clôture est couvert par 03_workshop)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, requested_work, technician_id) values
  ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Freins', '10000000-0000-0000-0000-0000000000a1'),
  ('70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'Pneus',  '10000000-0000-0000-0000-0000000000b1');

select pg_temp.fake_file('ro_photo') as photo_a \gset
select pg_temp.fake_file('ro_photo') as photo_b \gset

-- ---------------------------------------------------------------- Photos
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice
select lives_ok(
  format($$ insert into public.ro_photos (repair_order_id, file_id, label) values ('70000000-0000-0000-0000-000000000001', %L, 'Face avant') $$, :'photo_a'),
  'Le technicien assigné ajoute une photo à son OR');
select throws_like(
  format($$ insert into public.ro_photos (repair_order_id, file_id, label) values ('70000000-0000-0000-0000-000000000002', %L, 'Face avant') $$, :'photo_b'),
  '%row-level security%', 'Pas de photo sur l''OR d''un autre technicien');
select throws_like(
  format($$ insert into public.ro_photos (repair_order_id, file_id, label) values ('70000000-0000-0000-0000-000000000001', %L, '  ') $$, :'photo_b'),
  '%ro_photos_label_not_empty%', 'Une photo a toujours un libellé');

delete from public.ro_photos where file_id = :'photo_a';
reset role;
select ok((select deleted_at is not null from public.files where id = :'photo_a'),
          'Photo retirée : le fichier est marqué supprimé');

-- OR clôturé : plus de photo ajoutée par le technicien
update public.repair_orders set status = 'work_done' where id = '70000000-0000-0000-0000-000000000001';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_like(
  format($$ insert into public.ro_photos (repair_order_id, file_id, label) values ('70000000-0000-0000-0000-000000000001', %L, 'Arrière') $$, :'photo_b'),
  '%row-level security%', 'OR terminé : plus de photo ajoutée par le technicien');

-- ---------------------------------------------------------------- OR vus (badges Nouveau / Modifié)
select lives_ok(
  $$ insert into public.repair_order_seen (repair_order_id, profile_id) values ('70000000-0000-0000-0000-000000000001', auth.uid())
     on conflict (repair_order_id, profile_id) do update set seen_at = now() $$,
  'Le technicien marque son OR comme vu');
select throws_like(
  $$ insert into public.repair_order_seen (repair_order_id, profile_id) values ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1') $$,
  '%row-level security%', 'Pas de « vu » au nom d''un autre');
select is((select count(*) from public.repair_order_seen)::integer, 1, 'Chacun ne voit que ses propres « vu »');

select * from finish();
rollback;
