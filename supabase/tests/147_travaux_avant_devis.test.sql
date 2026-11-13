-- =============================================================================
-- Travaux réalisés avant le devis : brouillon de facture modifiable (rien d'émis ni d'envoyé), et pas de
-- fenêtre pour un devis fait sur l'OR avant tout travail
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

\ir helpers/fixtures.psql

-- Expertise (PL, 90 €/h) : diagnostic d'1 h et coup de valise à 40 €, devis accepté
set local session_replication_role = replica;
insert into public.repair_orders (id, number, vehicle_id, client_id, vehicle_type, requested_work, status) values
  ('50000000-0000-0000-0000-000000001471', 'OR91471', '30000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'pl', 'Diagnostic', 'to_invoice');
insert into public.ro_lines (id, repair_order_id, kind, position, line_type, description, estimated_hours, unit_price, quantity) values
  ('51000000-0000-0000-0000-000000001471', '50000000-0000-0000-0000-000000001471', 'done', 1, 'labor', 'Diagnostic', 1, null, 1),
  ('51000000-0000-0000-0000-000000001472', '50000000-0000-0000-0000-000000001471', 'done', 2, 'package', 'Coup de valise', null, 40, 1);
insert into public.quotes (id, number, status, repair_order_id, client_id, vehicle_id, accepted_at) values
  ('60000000-0000-0000-0000-000000001471', 'DV91471', 'accepted', '50000000-0000-0000-0000-000000001471',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now());
set local session_replication_role = origin;
-- Ligne « Fournitures et recyclage » ajoutée à toute nouvelle facture (15 € HT)
update public.company_settings set supplies_fee_ht = 15;

select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');  -- direction
\set ro '''50000000-0000-0000-0000-000000001471'''
select is(jsonb_array_length(public.pre_quote_work(:ro) -> 'lines'), 2, 'Expertise réelle : la fenêtre propose les deux travaux');

-- Les deux offerts
select public.settle_pre_quote_work(:ro,
  '[{"line_id": "51000000-0000-0000-0000-000000001471", "decision": "offered"},
    {"line_id": "51000000-0000-0000-0000-000000001472", "decision": "offered"}]') as settled \gset
\set inv '(:''settled''::jsonb ->> ''invoice_id'')::uuid'
select results_eq(
  format($$ select status::text, number from public.invoices where id = %L $$, :'settled'::jsonb ->> 'invoice_id'),
  $$ values ('draft'::text, null::text) $$,
  'Brouillon de facture : ni émis ni numéroté');
select is((:'settled'::jsonb ->> 'invoice_number'), null, 'Réponse : pas de numéro de facture');
select is((select status::text from public.repair_orders where id = :ro), 'to_invoice', 'L''OR n''est pas facturé tant que le brouillon n''est pas émis');
select is(public.pre_quote_work(:ro), null, 'Décision prise : plus de fenêtre');
select is((select count(*)::int from public.invoice_lines
           where invoice_id = (:'settled'::jsonb ->> 'invoice_id')::uuid and description = 'Fournitures et recyclage'), 1,
          'Fournitures et recyclage présentes sur le brouillon');

-- La direction offre aussi les fournitures, à la main, puis émet
select lives_ok(format($$ update public.invoice_lines set discount_percent = 100
                           where invoice_id = %L and description = 'Fournitures et recyclage' $$,
                       :'settled'::jsonb ->> 'invoice_id'),
                'Fournitures et recyclage offertes à la main sur le brouillon');
select is((select total_ttc from public.v_invoice_totals where invoice_id = (:'settled'::jsonb ->> 'invoice_id')::uuid),
          0.00::numeric, 'Tout offert : brouillon à 0 €');

-- Brouillon supprimé : la décision est à reprendre
delete from public.invoices where id = (:'settled'::jsonb ->> 'invoice_id')::uuid;
select isnt(public.pre_quote_work(:ro), null, 'Brouillon supprimé : la fenêtre revient');
select public.settle_pre_quote_work(:ro,
  '[{"line_id": "51000000-0000-0000-0000-000000001471", "decision": "billed", "price": 90},
    {"line_id": "51000000-0000-0000-0000-000000001472", "decision": "offered"}]') as again \gset
select ok(public.issue_invoice((:'again'::jsonb ->> 'invoice_id')::uuid) is not null, 'La direction émet elle-même le brouillon');
select is((select status::text from public.repair_orders where id = :ro), 'invoiced', 'OR facturé une fois la facture émise');

-- ---------------------------------------------------------------- Devis fait avant tout travail
reset role;
select set_config('request.jwt.claims', '', true);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select (public.create_repair_order('GH-147-ZZ', 'pl', 'Transports Dupont', 'Remplacement disques',
                                   p_technician_id => '10000000-0000-0000-0000-0000000000a1')).id as ro2 \gset
-- Devis préparé tout de suite depuis l'OR : la tâche y est reprise sans temps
insert into public.ro_lines (repair_order_id, kind, position, line_type, description, estimated_hours)
values (:'ro2', 'planned', 9, 'labor', 'Disques avant', 2);
select public.build_quote_from_repair_order(:'ro2') as q2 \gset
select public.set_quote_response(:'q2', 'accepted');
select is(public.pre_quote_work(:'ro2'), null, 'Devis fait avant tout travail : pas de fenêtre « travaux avant devis »');

-- Le mécano fait ensuite la tâche et donne son temps : toujours pas de fenêtre
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
update public.ro_lines set estimated_hours = 1.5
 where repair_order_id = :'ro2' and kind = 'done' and description = 'Remplacement disques';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select is(public.pre_quote_work(:'ro2'), null, 'Travail fait après le devis : jamais compté « avant le devis »');

select * from finish();
rollback;
