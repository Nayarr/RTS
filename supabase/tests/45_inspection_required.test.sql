-- =============================================================================
-- Fiche de contrôle complète obligatoire : posée par la direction à la création
-- de l'OR (direct ou depuis un devis), exigée avant « Travaux terminés »
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.create_repair_order('AB-123-CD', 'pl', null, 'Entretien', null, null, null, null, null, null, true) $$,
  '42501', 'Réservé à la direction : fiche de contrôle complète obligatoire', 'La réception ne pose pas l''exigence');
select is((select inspection_required from public.create_repair_order('AB-123-CD', 'pl', null, 'Entretien')), false,
          'Par défaut, fiche de contrôle libre');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select id as ro from public.create_repair_order('AB-123-CD', 'pl', null, 'Entretien', null,
  '10000000-0000-0000-0000-0000000000a1', null, null, null, null, true) \gset
select is((select inspection_required from public.v_repair_orders_overview where id = :'ro'), true,
          'La direction exige la fiche complète à la création');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select throws_ok(format($$ update public.repair_orders set inspection_required = false where id = %L $$, :'ro'),
  '42501', 'Réservé à la direction : fiche de contrôle complète obligatoire', 'La réception ne retire pas l''exigence');

-- ---------------------------------------------------------------- Clôture par le technicien
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.ro_photos (repair_order_id, file_id, label)
values (:'ro', pg_temp.fake_file('ro_photo'), 'Contrôle technique');
insert into public.inspections (repair_order_id, data)
values (:'ro', '{"usure": {"plaquettes_avant": "OK"}, "pneus": {"avant_etat": "OK", "arriere_etat": "OK"}, "controles": {"hayon": "OK"}}');
select throws_like(format($$ select public.complete_repair_order(%L) $$, :'ro'),
  '%Fiche de contrôle complète exigée : 11 points OK / 50 % / HS non renseignés%',
  'Points de la fiche non renseignés : clôture refusée');
update public.repair_orders set inspection_required = false where id = :'ro';
select is((select inspection_required from public.repair_orders where id = :'ro'), true,
          'Le technicien ne retire pas l''exigence');

update public.inspections set data = '{
  "usure": {"plaquettes_avant": "OK", "plaquettes_arriere": "OK", "disques_avant": "OK", "disques_arriere": "OK",
            "barre_accouplement": "OK", "barre_direction": "OK", "kit_accessoires": "OK"},
  "pneus": {"avant_etat": "OK", "arriere_etat": "OK"},
  "controles": {"etiquettes": "OK", "hayon": "OK", "extincteur1": "OK", "extincteur2": "OK", "extincteur6": "OK",
                "eclairage": "OK"}}'
where repair_order_id = :'ro';
select is(public.inspection_missing_points((select data from public.inspections where repair_order_id = :'ro')), 0,
          'Fiche complète : plus aucun point manquant');
select lives_ok(format($$ select public.complete_repair_order(%L) $$, :'ro'), 'Fiche complète : OR terminé');

-- Sans exigence : la fiche reste libre
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select id as free from public.create_repair_order('EF-456-GH', 'remorque', null, 'Éclairage', null,
  '10000000-0000-0000-0000-0000000000a1') \gset
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
insert into public.ro_photos (repair_order_id, file_id, label)
values (:'free', pg_temp.fake_file('ro_photo'), 'Contrôle technique');
select lives_ok(format($$ select public.complete_repair_order(%L) $$, :'free'), 'Sans exigence : fiche vide acceptée');

-- ---------------------------------------------------------------- OR depuis un devis accepté
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select id as quote from public.create_quote('Transports Dupont', 'ab 123 cd', 'pl') \gset
insert into public.quote_lines (quote_id, position, line_type, description, billed_hours, unit_price, quantity)
values (:'quote', 0, 'labor', 'Diagnostic', 1, 85, 1);
select public.set_quote_response(:'quote', 'accepted');
select throws_ok(format($$ select public.create_repair_order_from_quote(%L, null, null, null, null, true) $$, :'quote'),
  '42501', 'Réservé à la direction : fiche de contrôle complète obligatoire', 'Depuis un devis : réception refusée');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select public.create_repair_order_from_quote(:'quote', null, null, null, null, true) as from_quote \gset
select is((select inspection_required from public.repair_orders where id = :'from_quote'), true,
          'Depuis un devis : la direction exige la fiche complète');

select * from finish();
rollback;
