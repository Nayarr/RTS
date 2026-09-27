-- =============================================================================
-- Fichiers : droits d'envoi par catégorie, contrôles de type et de taille,
-- confirmation par la clé de service, expiration des envois abandonnés
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Qui peut envoyer quoi
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');  -- Alice (technicienne)
select ok(public.can_upload_file('ro_photo'), 'Un technicien envoie des photos d''OR');
select ok(not public.can_upload_file('logo'), 'Un technicien ne change pas le logo');
select ok(not public.can_upload_file('document_pdf'), 'Un technicien n''envoie pas de PDF de gestion');
select ok(not public.can_upload_file('clock_photo'), 'Seule la borne envoie les photos de pointage');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select ok(public.can_upload_file('document_pdf') and not public.can_upload_file('logo'),
          'La réception envoie des PDF mais pas le logo');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');  -- borne
select ok(public.can_upload_file('clock_photo') and not public.can_upload_file('ro_photo'),
          'La borne n''envoie que des photos de pointage');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
select ok(public.can_upload_file('logo'), 'La direction change le logo');

-- ---------------------------------------------------------------- Réservation
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
create temp table reserved on commit drop as
  select * from public.register_file('ro_photo', 'image/jpeg', 250000, 'rts-atelier', ' frein.jpg ');
grant select on reserved to service_role;

select ok((select storage_key ~ '^ro_photo/\d{4}/\d{2}/[0-9a-f-]{36}\.jpg$' from reserved),
          'La clé de stockage est générée par la base (catégorie/année/mois/uuid)');
select results_eq(
  $$ select uploaded_by, uploaded_at is null, original_name from public.files where id = (select file_id from reserved) $$,
  $$ values ('00000000-0000-0000-0000-0000000000a1'::uuid, true, 'frein.jpg') $$,
  'L''envoi est réservé au nom de l''appelant, en attente de confirmation');

select throws_like($$ select public.register_file('ro_photo', 'text/html', 1000, 'rts-atelier') $$,
                   '%Type de fichier non accepté%', 'Type refusé');
select throws_like($$ select public.register_file('ro_photo', 'image/jpeg', 11 * 1024 * 1024, 'rts-atelier') $$,
                   '%trop volumineux (maximum 10 Mo)%', 'Taille maximale par catégorie');
select throws_like($$ select public.register_file('logo', 'image/png', 1000, 'rts-atelier') $$,
                   '%non autorisé%', 'Catégorie interdite au rôle');
select throws_like($$ select public.confirm_file_upload((select file_id from reserved), auth.uid(), 1000, 'image/jpeg') $$,
                   '%permission denied%', 'Un utilisateur ne confirme pas lui-même son envoi');

select pg_temp.act_as_anon();
select throws_like($$ select public.register_file('ro_photo', 'image/jpeg', 1000, 'rts-atelier') $$,
                   '%permission denied%', 'Aucun envoi anonyme');

-- ---------------------------------------------------------------- Confirmation (Edge Function)
reset role;
set local role service_role;
select throws_like(
  $$ select public.confirm_file_upload((select file_id from reserved), '00000000-0000-0000-0000-0000000000b1', 1000, 'image/jpeg') $$,
  '%introuvable%', 'Seul l''auteur de l''envoi peut le confirmer');
select throws_like(
  $$ select public.confirm_file_upload((select file_id from reserved), '00000000-0000-0000-0000-0000000000a1', 1000, 'image/png') $$,
  '%Type de fichier différent%', 'Le type réellement stocké doit être celui annoncé');
select lives_ok(
  $$ select public.confirm_file_upload((select file_id from reserved), '00000000-0000-0000-0000-0000000000a1', 248000, 'image/jpeg') $$,
  'La clé de service confirme l''envoi avec la taille réelle');
select results_eq(
  $$ select size_bytes, uploaded_at is not null from public.files where id = (select file_id from reserved) $$,
  $$ values (248000::bigint, true) $$,
  'Envoi confirmé et taille réelle enregistrée');
reset role;

-- ---------------------------------------------------------------- Expiration des envois abandonnés
insert into public.files (id, storage_key, category, mime_type, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'test/abandon.jpg', 'ro_photo', 'image/jpeg', now() - interval '25 hours'),
  ('50000000-0000-0000-0000-000000000002', 'test/recent.jpg', 'ro_photo', 'image/jpeg', now() - interval '1 hour');
select public.expire_pending_files();
select results_eq(
  $$ select id, deleted_at is not null from public.files
     where id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002') order by id $$,
  $$ values ('50000000-0000-0000-0000-000000000001'::uuid, true), ('50000000-0000-0000-0000-000000000002'::uuid, false) $$,
  'Seuls les envois en attente depuis plus de 24 h expirent');

select * from finish();
rollback;
