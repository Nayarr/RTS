-- =============================================================================
-- Recherche globale (bureau uniquement)
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

-- ---------------------------------------------------------------- Données (hors règles métier)
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, created_at) values
  ('50000000-0000-0000-0000-000000000001', 'OR91234', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Freins', now() - interval '2 days'),
  ('50000000-0000-0000-0000-000000000002', 'OR91235', '30000000-0000-0000-0000-000000000003',
   '20000000-0000-0000-0000-000000000002', 'vul', 'Vidange', now() - interval '1 day');
insert into public.quotes (id, number, status, client_id, vehicle_id)
values ('60000000-0000-0000-0000-000000000001', 'DV95555', 'sent', '20000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000003');
insert into public.invoices (id, number, status, client_id, client_name, vehicle_label, issued_at, due_date, total_ht, total_vat, total_ttc)
values ('80000000-0000-0000-0000-00000000000a', 'F97777', 'issued', '20000000-0000-0000-0000-000000000001',
        'Transports Dupont', 'AB-123-CD', now(), current_date + 30, 100, 20, 120);
set local session_replication_role = origin;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- ---------------------------------------------------------------- Plaque sans tirets
select public.global_search('ab123') as r \gset
select is(jsonb_path_query_array(:'r'::jsonb, '$.vehicles[*].plate'), '["AB-123-CD"]'::jsonb,
          'Plaque saisie sans tiret ni majuscule');
select is(jsonb_path_query_array(:'r'::jsonb, '$.repair_orders[*].number'), '["OR91234"]'::jsonb,
          'OR du véhicule');
select is(jsonb_path_query_array(:'r'::jsonb, '$.invoices[*].number'), '["F97777"]'::jsonb,
          'Facture du véhicule (libellé du véhicule sur la facture)');

-- ---------------------------------------------------------------- Client : nom partiel, tous ses documents
select public.global_search('logistique mar') as r \gset
select is(jsonb_path_query_array(:'r'::jsonb, '$.clients[*].name'), '["Logistique Martin"]'::jsonb, 'Client par nom partiel');
select is(jsonb_path_query_array(:'r'::jsonb, '$.quotes[*].number'), '["DV95555"]'::jsonb, 'Devis du client');

-- ---------------------------------------------------------------- Numéros, du plus récent au plus ancien
select is(jsonb_path_query_array(public.global_search('or9123'), '$.repair_orders[*].number'),
          '["OR91235", "OR91234"]'::jsonb, 'Numéro d''OR partiel, le plus récent d''abord');
select is(jsonb_path_query_array(public.global_search('%'), '$.*[*]'), '[]'::jsonb,
          'Saisie trop courte ou sans lettre : aucun résultat');
select is(jsonb_path_query_array(public.global_search('%%'), '$.clients[*]'), '[]'::jsonb,
          '« % » est cherché tel quel, pas comme joker');

-- ---------------------------------------------------------------- Techniciens : pas de recherche
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select public.global_search('dupont') $$, '42501', null, 'Un technicien ne cherche pas dans le bureau');

select * from finish();
rollback;
