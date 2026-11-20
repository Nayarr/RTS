-- =============================================================================
-- Consignes : ancienne pièce d'un OR à renvoyer au fournisseur. Déclarée par le
-- bureau ou le mécano de l'OR ouvert ; suivie par le bureau seul (aussi après la
-- facture) : À renvoyer → Renvoyée → Remboursée / Refusée. Historique de l'OR.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

\ir helpers/fixtures.psql

set local rts.system = 'on';
insert into public.repair_orders (id, number, status, vehicle_id, vehicle_type, technician_id) values
  ('50000000-0000-0000-0000-000000000161', 'OR-T161', 'in_progress', '30000000-0000-0000-0000-000000000001', 'pl',
   '10000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000162', 'OR-T162', 'invoiced', '30000000-0000-0000-0000-000000000001', 'pl',
   '10000000-0000-0000-0000-0000000000a1');
insert into public.ro_lines (id, repair_order_id, kind, line_type, description, supplier_id, unit_price) values
  ('60000000-0000-0000-0000-000000000161', '50000000-0000-0000-0000-000000000161', 'done', 'part',
   'Alternateur 28V' || chr(10) || 'Réf. 0124', '40000000-0000-0000-0000-000000000001', 420),
  ('60000000-0000-0000-0000-000000000162', '50000000-0000-0000-0000-000000000161', 'done', 'part', 'Démarreur', null, 380),
  ('60000000-0000-0000-0000-000000000163', '50000000-0000-0000-0000-000000000161', 'done', 'labor', 'Dépose', null, null),
  ('60000000-0000-0000-0000-000000000164', '50000000-0000-0000-0000-000000000162', 'done', 'part', 'Étrier', null, 250);
set local rts.system = 'off';

-- ---------------------------------------------------------------- Mécano de l'OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select lives_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id)
     values ('60000000-0000-0000-0000-000000000161', '50000000-0000-0000-0000-000000000162') $$,
  'Le mécano de l''OR met l''ancienne pièce en consigne');
select results_eq(
  $$ select repair_order_id, supplier_id, status::text, created_by from public.part_cores
     where ro_line_id = '60000000-0000-0000-0000-000000000161' $$,
  $$ values ('50000000-0000-0000-0000-000000000161'::uuid, '40000000-0000-0000-0000-000000000001'::uuid,
             'to_return', '00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'OR et fournisseur repris de la pièce (OR passé ignoré), à renvoyer, auteur noté');
select is((select part_name from public.v_part_cores where ro_line_id = '60000000-0000-0000-0000-000000000161'),
          'Alternateur 28V', 'Le mécano lit la consigne de son OR (première ligne de la désignation)');
select throws_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id, status)
     values ('60000000-0000-0000-0000-000000000162', '50000000-0000-0000-0000-000000000161', 'refunded') $$,
  '42501', null, 'Le mécano ne déclare qu''une consigne à renvoyer');
select throws_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id)
     values ('60000000-0000-0000-0000-000000000163', '50000000-0000-0000-0000-000000000161') $$,
  '22023', 'Seule une pièce peut avoir une consigne', 'Pas de consigne sur une ligne de main-d''œuvre');
select throws_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id)
     values ('60000000-0000-0000-0000-000000000164', '50000000-0000-0000-0000-000000000162') $$,
  '42501', null, 'Pas de consigne par le mécano sur un OR fermé');
select is_empty(
  $$ update public.part_cores set status = 'returned' where ro_line_id = '60000000-0000-0000-0000-000000000161'
     returning id $$,
  'Le mécano ne suit pas le renvoi (bureau seul)');
reset role;

-- Bruno n'est pas sur l'OR
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select is_empty($$ select id from public.v_part_cores $$, 'Un autre mécano ne voit pas les consignes');
select throws_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id)
     values ('60000000-0000-0000-0000-000000000162', '50000000-0000-0000-0000-000000000161') $$,
  '42501', null, 'Un autre mécano ne déclare pas de consigne');
reset role;

-- Le mécano retire sa consigne tant qu'elle est à renvoyer
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.part_cores (ro_line_id, repair_order_id)
values ('60000000-0000-0000-0000-000000000162', '50000000-0000-0000-0000-000000000161');
select isnt_empty(
  $$ delete from public.part_cores where ro_line_id = '60000000-0000-0000-0000-000000000162' returning id $$,
  'Le mécano retire une consigne encore à renvoyer');
reset role;

-- ---------------------------------------------------------------- Bureau
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select lives_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id, amount_ht)
     values ('60000000-0000-0000-0000-000000000164', '50000000-0000-0000-0000-000000000162', 85) $$,
  'Le bureau déclare une consigne sur un OR déjà facturé');
update public.part_cores set amount_ht = 120 where ro_line_id = '60000000-0000-0000-0000-000000000161';
update public.part_cores set status = 'returned' where ro_line_id = '60000000-0000-0000-0000-000000000161';
select results_eq(
  $$ select returned_on, refunded_on from public.part_cores where ro_line_id = '60000000-0000-0000-0000-000000000161' $$,
  $$ values (public.paris_date(now()), null::date) $$,
  'Renvoyée sans date : aujourd''hui (heure de Paris)');
update public.part_cores set status = 'refunded' where ro_line_id = '60000000-0000-0000-0000-000000000161';
select results_eq(
  $$ select refunded_on, refunded_amount_ht from public.part_cores
     where ro_line_id = '60000000-0000-0000-0000-000000000161' $$,
  $$ values (public.paris_date(now()), 120.00::numeric) $$,
  'Remboursée sans date ni avoir : aujourd''hui, montant de la consigne');
update public.part_cores set refunded_amount_ht = 100, refunded_on = '2026-11-02'
where ro_line_id = '60000000-0000-0000-0000-000000000161';
select results_eq(
  $$ select refunded_on, refunded_amount_ht from public.part_cores
     where ro_line_id = '60000000-0000-0000-0000-000000000161' $$,
  $$ values ('2026-11-02'::date, 100.00::numeric) $$,
  'Avoir partiel et date saisis gardés');
update public.part_cores set status = 'to_return' where ro_line_id = '60000000-0000-0000-0000-000000000161';
select results_eq(
  $$ select returned_on, refunded_on, refunded_amount_ht from public.part_cores
     where ro_line_id = '60000000-0000-0000-0000-000000000161' $$,
  $$ values (null::date, null::date, null::numeric) $$,
  'Retour à « À renvoyer » : dates et avoir effacés');
select throws_ok(
  $$ update public.part_cores set ro_line_id = '60000000-0000-0000-0000-000000000162'
     where ro_line_id = '60000000-0000-0000-0000-000000000161' $$,
  '22023', 'La consigne reste attachée à sa pièce', 'La consigne ne change pas de pièce');
select throws_ok(
  $$ insert into public.part_cores (ro_line_id, repair_order_id)
     values ('60000000-0000-0000-0000-000000000161', '50000000-0000-0000-0000-000000000161') $$,
  '23505', null, 'Une seule consigne par pièce');
select throws_ok(
  $$ update public.part_cores set amount_ht = -1 where ro_line_id = '60000000-0000-0000-0000-000000000164' $$,
  '23514', null, 'Montant négatif refusé');
-- Renvoi groupé sur OR facturé
update public.part_cores set status = 'returned', returned_on = '2026-11-18' where status = 'to_return';
select set_eq(
  $$ select ro_line_id::text from public.part_cores where status = 'returned' and returned_on = '2026-11-18' $$,
  $$ values ('60000000-0000-0000-0000-000000000161'), ('60000000-0000-0000-0000-000000000164') $$,
  'Renvoi groupé, y compris sur un OR facturé');
select results_eq(
  $$ select c.part_name, c.supplier_name, c.repair_order_number = ro.number, c.vehicle_plate
     from public.v_part_cores c join public.repair_orders ro on ro.id = c.repair_order_id order by c.part_name $$,
  $$ values ('Alternateur 28V', 'Pièces Poids Lourds', true, 'AB-123-CD'),
            ('Étrier', null, true, 'AB-123-CD') $$,
  'Liste du bureau : pièce, fournisseur, OR et véhicule');
select lives_ok(
  $$ delete from public.part_cores where ro_line_id = '60000000-0000-0000-0000-000000000164' $$,
  'Le bureau retire une consigne déjà renvoyée');
reset role;

-- Le mécano ne retire plus une consigne renvoyée
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select is_empty(
  $$ delete from public.part_cores where ro_line_id = '60000000-0000-0000-0000-000000000161' returning id $$,
  'Le mécano ne retire pas une consigne déjà renvoyée');
reset role;

-- Visiteur anonyme
select pg_temp.act_as_anon();
select throws_ok($$ select id from public.part_cores $$, '42501', null, 'Anonyme : aucun accès');
reset role;

-- ---------------------------------------------------------------- Historique de l'OR
select bag_eq(
  $$ select label from public.ro_events where repair_order_id = '50000000-0000-0000-0000-000000000161'
     and label like 'Consigne%' $$,
  $$ values ('Consigne : ancienne pièce à renvoyer : Alternateur 28V'),
            ('Consigne : ancienne pièce à renvoyer : Démarreur'),
            ('Consigne retirée : Démarreur'),
            ('Consigne : ancienne pièce renvoyée : Alternateur 28V'),
            ('Consigne remboursée : Alternateur 28V'),
            ('Consigne : ancienne pièce à renvoyer : Alternateur 28V'),
            ('Consigne : ancienne pièce renvoyée : Alternateur 28V') $$,
  'Chaque étape de la consigne est inscrite dans l''historique de l''OR');
select is((select count(*)::int from public.ro_events
           where repair_order_id = '50000000-0000-0000-0000-000000000162' and label like 'Consigne%'),
          3, 'OR facturé : déclaration, renvoi et retrait inscrits');

-- Pièce supprimée : sa consigne disparaît avec elle
set local rts.system = 'on';
insert into public.part_cores (ro_line_id, repair_order_id)
values ('60000000-0000-0000-0000-000000000162', '50000000-0000-0000-0000-000000000161');
delete from public.ro_lines where id = '60000000-0000-0000-0000-000000000162';
select is_empty($$ select id from public.part_cores where ro_line_id = '60000000-0000-0000-0000-000000000162' $$,
                'Pièce supprimée : consigne supprimée');
select is((select count(*)::int from public.ro_events where label = 'Consigne retirée : Démarreur'), 1,
          'Pièce supprimée : pas de ligne d''historique en plus');

select * from finish();
rollback;
