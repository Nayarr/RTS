-- =============================================================================
-- Paiements : type de compte du client, échéance d'une facture émise modifiable
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');

select is((select account_type from public.clients where id = '20000000-0000-0000-0000-000000000001'),
          'comptant', 'Client comptant par défaut');
update public.clients set account_type = 'prelevement' where id = '20000000-0000-0000-0000-000000000001';
select is((select account_type from public.v_clients_overview where id = '20000000-0000-0000-0000-000000000001'),
          'prelevement', 'Type de compte dans la liste des clients');
select throws_ok($$ update public.clients set account_type = 'credit' where id = '20000000-0000-0000-0000-000000000001' $$,
                 '23514', null, 'Seuls comptant et prélèvement');

-- Facture émise
insert into public.invoices (id, client_id) values ('60000000-0000-0000-0000-000000000091', '20000000-0000-0000-0000-000000000001');
insert into public.invoice_lines (invoice_id, line_type, description, unit_price) values
  ('60000000-0000-0000-0000-000000000091', 'labor', 'Diagnostic', 100);
select lives_ok($$ select public.issue_invoice('60000000-0000-0000-0000-000000000091') $$, 'Facture émise');

select lives_ok($$ select public.set_invoice_due_date('60000000-0000-0000-0000-000000000091', current_date + 45) $$,
                'La réception déplace l''échéance d''une facture émise');
select is((select due_date from public.invoices where id = '60000000-0000-0000-0000-000000000091'),
          current_date + 45, 'Nouvelle échéance enregistrée');
select is((select new_date::text || ' par ' || changed_by::text from public.invoice_due_date_changes
           where invoice_id = '60000000-0000-0000-0000-000000000091'),
          (current_date + 45)::text || ' par 00000000-0000-0000-0000-0000000000e1', 'Changement gardé, avec son auteur');
select throws_like($$ select public.set_invoice_due_date('60000000-0000-0000-0000-000000000091', current_date - 1) $$,
                   '%précéder l''émission%', 'Jamais avant l''émission');
select throws_like($$ update public.invoices set due_date = current_date + 90 where id = '60000000-0000-0000-0000-000000000091' $$,
                   '%ne peut plus être modifiée%', 'En direct, la facture émise reste figée');

select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.set_invoice_due_date('60000000-0000-0000-0000-000000000091', current_date + 60) $$,
                 '42501', null, 'Le technicien ne déplace pas l''échéance');

select * from finish();
rollback;
