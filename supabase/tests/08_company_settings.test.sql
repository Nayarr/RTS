-- =============================================================================
-- Réglages : modification réservée à la direction, garde-fous du logo
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Lecture / modification
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicienne
select is((select legal_name from public.company_settings), 'RAPID TRUCK SERVICE',
          'Tous les comptes actifs lisent les coordonnées (en-têtes de documents)');
update public.company_settings set legal_name = 'Piratage';
update public.labor_rates set hourly_rate = 1 where category = 'pl';
update public.app_settings set daily_hours = 1;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.company_settings set legal_name = 'Piratage';

reset role;
select results_eq(
  $$ select (select legal_name from public.company_settings), (select hourly_rate from public.labor_rates where category = 'pl'),
            (select daily_hours from public.app_settings) $$,
  $$ values ('RAPID TRUCK SERVICE'::text, 90::numeric, 8::numeric) $$,
  'Ni un technicien ni la réception ne modifient les réglages');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
update public.company_settings set phone = '01 23 45 67 89', default_vat_rate = 20;
update public.labor_rates set hourly_rate = 95 where category = 'pl';
reset role;
select results_eq(
  $$ select (select phone from public.company_settings), (select hourly_rate from public.labor_rates where category = 'pl') $$,
  $$ values ('01 23 45 67 89'::text, 95::numeric) $$,
  'La direction modifie les réglages');

-- ---------------------------------------------------------------- Logo
select pg_temp.fake_file('logo') as logo_1 \gset
select pg_temp.fake_file('logo') as logo_2 \gset
select pg_temp.fake_file('ro_photo') as photo \gset
insert into public.files (id, storage_key, category, mime_type)
values ('60000000-0000-0000-0000-000000000001', 'logo/en-attente.png', 'logo', 'image/png');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select throws_like(format($$ update public.company_settings set logo_file_id = %L $$, :'photo'),
                   '%Logo invalide%', 'Une photo d''OR ne peut pas servir de logo');
select throws_like($$ update public.company_settings set logo_file_id = '60000000-0000-0000-0000-000000000001' $$,
                   '%Logo invalide%', 'Un envoi non confirmé ne peut pas servir de logo');
select lives_ok(format($$ update public.company_settings set logo_file_id = %L $$, :'logo_1'),
                'Un logo confirmé est accepté');
select lives_ok(format($$ update public.company_settings set logo_file_id = %L $$, :'logo_2'),
                'Le logo peut être remplacé');
reset role;
select results_eq(
  format($$ select id, deleted_at is not null from public.files where id in (%L, %L) order by deleted_at nulls first $$,
         :'logo_2', :'logo_1'),
  format($$ values (%L::uuid, false), (%L::uuid, true) $$, :'logo_2', :'logo_1'),
  'L''ancien logo est marqué supprimé, le nouveau est conservé');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
select lives_ok($$ update public.company_settings set logo_file_id = null $$, 'Le logo peut être retiré');

select * from finish();
rollback;
