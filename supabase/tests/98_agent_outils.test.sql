-- =============================================================================
-- Agent Direction : nouvelles actions préparées, faites seulement après validation ; mails
-- préparés modifiables avant l'envoi
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

\ir helpers/fixtures.psql

insert into public.repair_orders (id, vehicle_id, client_id, requested_work, status) values
  ('50000000-0000-0000-0000-000000000981', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'Freinage', 'assigned'),
  ('50000000-0000-0000-0000-000000000982', '30000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'Éclairage', 'work_done');
insert into public.appointments (id, client_id, vehicle_id, vehicle_type, scheduled_date, start_time, reason)
values ('60000000-0000-0000-0000-000000000981', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 'pl', current_date + 5, '09:00', 'Vidange'),
       ('60000000-0000-0000-0000-000000000982', '20000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001', 'pl', current_date + 6, '14:00', 'Pneus');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
insert into public.agent_actions (id, kind, payload, summary) values
  ('a9800000-0000-0000-0000-000000000001', 'vehicle_deadline',
   '{"vehicle_id": "30000000-0000-0000-0000-000000000001", "field": "tailgate_due_date", "date": "2027-03-14"}', 'Hayon'),
  ('a9800000-0000-0000-0000-000000000002', 'schedule_order',
   format('{"repair_order_id": "50000000-0000-0000-0000-000000000981", "date": "%s", "start_time": "08:00", "end_time": "10:30"}',
          current_date + 2)::jsonb, 'Date de l''OR'),
  ('a9800000-0000-0000-0000-000000000003', 'appointment_change',
   format('{"appointment_id": "60000000-0000-0000-0000-000000000981", "date": "%s", "start_time": "10:00", "end_time": null}',
          current_date + 7)::jsonb, 'Rendez-vous déplacé'),
  ('a9800000-0000-0000-0000-000000000004', 'appointment_change',
   '{"appointment_id": "60000000-0000-0000-0000-000000000982", "cancel": true}', 'Rendez-vous annulé'),
  ('a9800000-0000-0000-0000-000000000005', 'order_to_invoice',
   '{"repair_order_id": "50000000-0000-0000-0000-000000000982"}', 'Facture à faire'),
  ('a9800000-0000-0000-0000-000000000006', 'order_to_invoice',
   '{"repair_order_id": "50000000-0000-0000-0000-000000000981"}', 'Facture à faire d''un OR en cours'),
  ('a9800000-0000-0000-0000-000000000007', 'invoice_draft',
   '{"repair_order_ids": ["50000000-0000-0000-0000-000000000982"]}', 'Brouillon'),
  ('a9800000-0000-0000-0000-000000000008', 'send_mail',
   '{"to": "compta@dupont.fr", "client_name": "Transports Dupont", "subject": "CT", "text": "Bonjour", "category": "workshop", "invoice_ids": []}',
   'Mail à Transports Dupont (compta@dupont.fr) : « CT »');

select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'), null::date,
          'Action préparée : rien n''est encore changé');

select is((public.execute_agent_action('a9800000-0000-0000-0000-000000000001')).status, 'done', 'Échéance validée');
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          '2027-03-01'::date, 'Contrôle hayon noté au mois, comme sur la fiche');

select is((public.execute_agent_action('a9800000-0000-0000-0000-000000000002')).status, 'done', 'Date de l''OR validée');
select results_eq(
  $$ select planned_date, planned_start, planned_end from public.repair_orders where id = '50000000-0000-0000-0000-000000000981' $$,
  $$ values (current_date + 2, '08:00'::time, '10:30'::time) $$,
  'OR prévu au jour et aux heures dits');

select is((public.execute_agent_action('a9800000-0000-0000-0000-000000000003')).status, 'done', 'Rendez-vous déplacé');
select results_eq(
  $$ select scheduled_date, start_time, status::text from public.appointments where id = '60000000-0000-0000-0000-000000000981' $$,
  $$ values (current_date + 7, '10:00'::time, 'planned') $$,
  'Rendez-vous au nouveau jour, à la nouvelle heure');
select is((public.execute_agent_action('a9800000-0000-0000-0000-000000000004')).status, 'done', 'Rendez-vous annulé');
select is((select status::text from public.appointments where id = '60000000-0000-0000-0000-000000000982'), 'cancelled',
          'Rendez-vous annulé au planning');

select is((public.execute_agent_action('a9800000-0000-0000-0000-000000000005')).status, 'done', 'OR validé');
select is((select status::text from public.repair_orders where id = '50000000-0000-0000-0000-000000000982'), 'to_invoice',
          'OR terminé atelier passé « Facture à faire »');
select is((public.execute_agent_action('a9800000-0000-0000-0000-000000000006')).status, 'failed',
          'OR pas terminé : statut non changé, échec noté');

select (public.execute_agent_action('a9800000-0000-0000-0000-000000000007')).result ->> 'link' as draft_link \gset
select results_eq(
  $$ select '/factures/' || i.id::text, i.status::text from public.invoices i
     join public.invoice_repair_orders iro on iro.invoice_id = i.id
     where iro.repair_order_id = '50000000-0000-0000-0000-000000000982' $$,
  format($$ values (%L, 'draft') $$, :'draft_link'),
  'Brouillon de facture créé, jamais émis, lien vers la facture');

-- Mail préparé : modifié avant l'envoi
select is((public.edit_agent_mail('a9800000-0000-0000-0000-000000000008', ' Atelier@Dupont.fr ', 'Contrôle technique',
                                  'Bonjour, votre contrôle approche.')).summary,
          'Mail à Transports Dupont (atelier@dupont.fr) : « Contrôle technique »',
          'Mail modifié : destinataire, objet et résumé à jour');
select throws_ok($$ select public.edit_agent_mail('a9800000-0000-0000-0000-000000000008', 'pas-une-adresse', 'X', 'Y') $$,
                 '22023', 'Adresse e-mail invalide', 'Adresse invalide refusée');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select throws_ok($$ select public.edit_agent_mail('a9800000-0000-0000-0000-000000000008', 'a@b.fr', 'X', 'Y') $$,
                 'P0002', 'Mail préparé introuvable', 'La réception ne modifie pas les mails préparés par la direction');

select * from finish();
rollback;
