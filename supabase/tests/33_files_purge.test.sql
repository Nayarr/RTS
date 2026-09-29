-- =============================================================================
-- Purge des fichiers : orphelins marqués, lot à effacer de R2, confirmation, droits
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

\ir helpers/fixtures.psql

-- Fichiers envoyés il y a 10 jours : un logo en service, une carte grise rattachée,
-- une photo jamais rattachée, une photo récente pas encore rattachée.
select pg_temp.fake_file('logo') as logo \gset
select pg_temp.fake_file('registration_doc') as card \gset
select pg_temp.fake_file('ro_photo') as orphan \gset
select pg_temp.fake_file('ro_photo') as recent \gset
update public.files set uploaded_at = now() - interval '10 days'
where id in (:'logo', :'card', :'orphan');

set local session_replication_role = replica;
update public.company_settings set logo_file_id = :'logo';
update public.vehicles set registration_doc_file_id = :'card' where id = '30000000-0000-0000-0000-000000000001';
set local session_replication_role = origin;

-- ---------------------------------------------------------------- Orphelins
select is(public.mark_orphan_files(), 1, 'Un seul orphelin : la photo jamais rattachée depuis 7 jours');
select ok((select deleted_at is not null from public.files where id = :'orphan'), 'Orphelin marqué supprimé');
select ok((select bool_and(deleted_at is null) from public.files where id in (:'logo', :'card')),
          'Fichiers rattachés (logo, carte grise) conservés');
select ok((select deleted_at is null from public.files where id = :'recent'),
          'Envoi récent laissé le temps d''être rattaché');

-- Déjà supprimé par ailleurs (photo de pointage expirée, logo remplacé…)
update public.files set deleted_at = now() - interval '1 day' where id = :'recent';

-- ---------------------------------------------------------------- Lot pour l'Edge Function (clé de service)
set local role service_role;
select is((select count(*)::integer from public.files_to_purge(100) where id in (:'orphan', :'recent')), 2,
          'Les deux fichiers supprimés sont à effacer de R2');
select is((select count(*)::integer from public.files_to_purge(1)), 1, 'Taille du lot respectée');
select is(public.mark_files_purged(array[:'orphan', :'logo']::uuid[]), 1,
          'Seul un fichier supprimé peut être noté purgé');
select is((select count(*)::integer from public.files_to_purge(100) where id in (:'orphan', :'recent')), 1,
          'Fichier purgé retiré de la liste');
reset role;

select ok((select purged_at is not null from public.files where id = :'orphan'), 'Date de purge notée, ligne conservée');

-- ---------------------------------------------------------------- Droits
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select throws_ok('select public.files_to_purge(10)', '42501', null, 'Liste à purger inaccessible depuis l''appli');
select throws_ok('select public.mark_orphan_files()', '42501', null, 'Marquage des orphelins inaccessible');
reset role;

-- Sans secrets dans Vault (tests), l'appel à l'Edge Function est ignoré sans erreur.
delete from vault.secrets where name in ('project_url', 'cron_secret');
select is(public.invoke_edge_function('files-purge'), null, 'Projet non configuré : appel ignoré');

select * from finish();
rollback;
