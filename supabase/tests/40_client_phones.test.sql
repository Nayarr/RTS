-- =============================================================================
-- Fiche client : contact de référence et autres numéros libellés
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

select lives_ok($$
  update public.clients
     set contact_name = 'Paul Martin', phone = '06 12 34 56 78',
         other_phones = '[{"label": "Comptabilité", "phone": "01 23 45 67 89"},
                          {"label": "Chef d''atelier", "phone": "06 98 76 54 32"}]'
   where id = '20000000-0000-0000-0000-000000000001'
$$, 'La réception enregistre le contact de référence et deux autres numéros');

select is((select other_phones -> 1 ->> 'label' from public.v_clients_overview
           where id = '20000000-0000-0000-0000-000000000001'),
          'Chef d''atelier', 'Les autres numéros sont repris dans la liste des clients, dans l''ordre saisi');
select is((select contact_name from public.v_clients_overview where id = '20000000-0000-0000-0000-000000000001'),
          'Paul Martin', 'Contact de référence repris dans la liste des clients');

select throws_ok($$
  update public.clients set other_phones = '[{"label": "", "phone": "01 23 45 67 89"}]'
   where id = '20000000-0000-0000-0000-000000000001'
$$, '23514', null, 'Un autre numéro sans libellé est refusé');
select throws_ok($$
  update public.clients set other_phones = '[{"label": "Comptabilité", "phone": " "}]'
   where id = '20000000-0000-0000-0000-000000000001'
$$, '23514', null, 'Un libellé sans numéro est refusé');
select throws_ok($$
  update public.clients set other_phones = '[{"label": "Comptabilité", "phone": "01", "note": "x"}]'
   where id = '20000000-0000-0000-0000-000000000001'
$$, '23514', null, 'Rien d''autre que le libellé et le numéro');
select throws_ok($$
  update public.clients
     set other_phones = (select jsonb_agg(jsonb_build_object('label', 'N° ' || n, 'phone', '01 00 00 00 0' || n))
                         from generate_series(0, 10) n)
   where id = '20000000-0000-0000-0000-000000000001'
$$, '23514', null, '10 autres numéros au plus');

select * from finish();
rollback;
