-- =============================================================================
-- OR créé depuis un devis : une tâche à faire par ligne
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
select id as quote from public.create_quote('Transports Dupont', 'ab 123 cd', 'pl') \gset
insert into public.quote_lines (quote_id, position, line_type, description, unit_price, quantity)
values (:'quote', 0, 'package', E'Remplacement Barre d''accouplement\nDépose et repose, contrôle du parallélisme', 250, 1),
       (:'quote', 1, 'text', 'Prévoir le véhicule pour la journée', 0, 1),
       (:'quote', 2, 'labor', 'Remplacement Extincteur 1 kg cabine / 2 kg cabine', 45, 1);
select public.set_quote_response(:'quote', 'accepted');
select public.create_repair_order_from_quote(:'quote', null) as ro \gset

select is((select requested_work from public.repair_orders where id = :'ro'),
          E'Remplacement Barre d''accouplement\nRemplacement Extincteur 1 kg cabine / 2 kg cabine',
          'Une tâche par ligne (titre de chaque travail, sans les lignes de texte libre)');
select is((select count(*)::int from public.ro_lines where repair_order_id = :'ro' and kind = 'planned'), 3,
          'Les lignes du devis restent reprises sur l''OR');

select * from finish();
rollback;
