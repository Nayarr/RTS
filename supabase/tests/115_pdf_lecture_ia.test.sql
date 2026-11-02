-- =============================================================================
-- PDF accepté là où l'assistant lit un document (photo d'étiquette de l'OR, étiquette lue)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

select ok(public.file_mime_allowed('ro_photo', 'application/pdf'), 'OR : contrôle technique ou étiquette en PDF');
select ok(public.file_mime_allowed('label_scan', 'application/pdf'), 'Étiquette lue en PDF');
select ok(not public.file_mime_allowed('ro_photo', 'text/html'), 'Toujours pas d''autre type');
select ok(not public.file_mime_allowed('clock_photo', 'application/pdf')
          and not public.file_mime_allowed('signature', 'application/pdf'),
          'Pointage et signature : images seulement');

select * from finish();
rollback;
