-- =============================================================================
-- Sauvegarde : export complet réservé à la direction, secrets exclus, rappel dans la cloche
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Rappel : jamais sauvegardé
select is(public.backup_reminder(), 1, 'Aucune sauvegarde : alerte dans la cloche');
select is(public.backup_reminder(), 0, 'Une seule alerte par semaine');

-- ---------------------------------------------------------------- Accès
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok('select public.export_backup()', '42501', null, 'Réception : sauvegarde refusée');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- technicien
select throws_ok('select public.export_backup()', '42501', null, 'Technicien : sauvegarde refusée');

-- ---------------------------------------------------------------- Contenu
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select public.export_backup() as backup \gset
reset role;

select is(:'backup'::jsonb ->> 'app', 'RTS Atelier', 'Fichier identifié');
select ok((:'backup'::jsonb ->> 'schema_version') is not null, 'Version du schéma incluse');
select is(jsonb_array_length(:'backup'::jsonb -> 'tables' -> 'clients'),
          (select count(*)::integer from public.clients), 'Tous les clients exportés');
select ok(:'backup'::jsonb -> 'tables' ? 'invoices' and :'backup'::jsonb -> 'tables' ? 'company_settings',
          'Factures et réglages exportés');
select ok(not (:'backup'::jsonb -> 'tables' ?| array['technician_pins', 'kiosk_secrets', 'push_subscriptions']),
          'Codes PIN, code de sortie et abonnements jamais exportés');

select ok((select last_backup_at > now() - interval '1 minute' from public.app_settings),
          'Date de la dernière sauvegarde retenue');

select * from finish();
rollback;
