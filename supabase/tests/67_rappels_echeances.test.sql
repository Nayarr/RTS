-- =============================================================================
-- E-mails automatiques : rappel la veille, échéances à 48 h avec lien de prise de rendez-vous,
-- rendez-vous demandé en ligne puis confirmé, antipollution des utilitaires
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

\ir helpers/fixtures.psql

-- 10 h à Paris aujourd'hui (heures d'envoi)
select ((current_date::timestamp + interval '10 hours') at time zone 'Europe/Paris') as now10 \gset
select ((current_date::timestamp + interval '22 hours') at time zone 'Europe/Paris') as now22 \gset

-- ---------------------------------------------------------------- Antipollution
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
update public.vehicles set ct_due_date = current_date + 500 where id = '30000000-0000-0000-0000-000000000003';
select is((select antipollution_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000003'),
          ((current_date + 500) - interval '1 year')::date,
          'Utilitaire : antipollution un an avant le contrôle technique');
update public.vehicles set ct_due_date = current_date + 500 where id = '30000000-0000-0000-0000-000000000001';
select is((select antipollution_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          null, 'Poids lourd : pas d''antipollution');

-- ---------------------------------------------------------------- Rappel la veille
insert into public.appointments (id, client_id, vehicle_id, scheduled_date, start_time, reason)
values ('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002', current_date + 1, '10:00', 'Vidange');
reset role;

select is((select count(*) from jsonb_array_elements(public.prepare_auto_mails(:'now22')) i
           where i ->> 'kind' = 'appointment_reminder'), 0::bigint, 'Pas d''envoi à 22 h');
select is((select i ->> 'to' from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'appointment_reminder'), 'compta@dupont.fr', 'Rappel du rendez-vous de demain au client');
select public.record_auto_mail('appointment_reminder:80000000-0000-0000-0000-000000000001', 'appointment_reminder',
                               'compta@dupont.fr', null, null, '80000000-0000-0000-0000-000000000001', 'msg-1', null);
select isnt((select reminder_sent_at from public.appointments where id = '80000000-0000-0000-0000-000000000001'),
            null, 'Rappel envoyé : noté sur le rendez-vous');
select is((select count(*) from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'appointment_reminder'), 0::bigint, 'Le rappel ne part qu''une fois');

-- ---------------------------------------------------------------- Échéance à 48 h
update public.appointments set status = 'cancelled' where id = '80000000-0000-0000-0000-000000000001';
update public.vehicles set ct_due_date = current_date + 2 where id = '30000000-0000-0000-0000-000000000001';
select is((select i ->> 'reason' from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'ct'), 'Contrôle technique', 'Contrôle technique dans 48 h : e-mail préparé');
select (select i ->> 'token' from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i where i ->> 'kind' = 'ct') as token \gset
select is((select count(*) from public.booking_links), 1::bigint, 'Un seul lien de prise de rendez-vous, réutilisé');

-- Échec d'envoi : nouvel essai, trois au plus
select public.record_auto_mail(k, 'ct', 'compta@dupont.fr', null, null, null, null, 'Refusé')
from (select i ->> 'key' as k from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i where i ->> 'kind' = 'ct') x,
     generate_series(1, 3);
select is((select count(*) from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i where i ->> 'kind' = 'ct'),
          0::bigint, 'Après trois échecs, l''e-mail n''est plus proposé');

-- ---------------------------------------------------------------- Page publique
select pg_temp.act_as_anon();
select is((public.public_booking(:'token')) ->> 'plate', 'AB-123-CD', 'Le lien ouvre la prise de rendez-vous du véhicule');
select ok(jsonb_array_length((public.public_booking(:'token')) -> 'slots') > 0, 'Créneaux libres proposés');
select is(public.public_booking('inconnu'), null, 'Lien inconnu : rien');
select ((public.public_booking(:'token')) -> 'slots' -> 0 ->> 'date') as slot_date,
       ((public.public_booking(:'token')) -> 'slots' -> 0 -> 'times' ->> 0) as slot_time \gset
select is((public.public_book_appointment(:'token', :'slot_date'::date, :'slot_time'::time)) ->> 'status',
          'requested', 'Le client demande un créneau');
select throws_ok(format($$ select public.public_book_appointment(%L, %L::date, %L::time) $$, :'token', :'slot_date', :'slot_time'),
                 'P0001', null, 'Une seule demande par lien');
select throws_ok($$ select public.prepare_auto_mails() $$, '42501', null, 'Un visiteur ne prépare pas les e-mails');
reset role;

select is((select count(*) from public.notifications where type = 'appointment_requested'), 2::bigint,
          'Direction et réception prévenues');

-- ---------------------------------------------------------------- Confirmation
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.confirm_appointment_request((select appointment_id from public.booking_links where token = :'token'));
reset role;
select is((select count(*) from jsonb_array_elements(public.prepare_auto_mails(:'now10')) i
           where i ->> 'kind' = 'appointment_confirmed'), 1::bigint, 'Confirmé : le client reçoit la confirmation');

select * from finish();
rollback;
