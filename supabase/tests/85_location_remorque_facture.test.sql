-- =============================================================================
-- Location : remorque sans photo du tableau de bord, facture préparée à la remise des clés,
-- suppléments facturés à part une fois la facture de départ émise
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

\ir helpers/fixtures.psql

select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception
insert into public.fleet_vehicles (id, plate, brand, model, category, daily_rate, license_category)
values ('60000000-0000-0000-0000-000000000085', 'RM-085-TR', 'Schmitz', 'Cargobull', 'trailer', 60, 'BE');
insert into public.clients (id, name, billing_address)
values ('20000000-0000-0000-0000-000000000085', 'Transports Remorque', '1 rue du Fret, 95190 Goussainville');
insert into public.driving_licenses (id, client_id, last_name, first_name, license_number, categories, valid_until,
                                     recto_file_id, verso_file_id)
values ('90000000-0000-0000-0000-000000000085', '20000000-0000-0000-0000-000000000085', 'DURAND', 'Paul',
        '910395200185', '{B,BE}', '2033-06-22', pg_temp.fake_file('other'), pg_temp.fake_file('other'));
insert into public.rentals (id, client_id, fleet_vehicle_id, driving_license_id, departure_at, planned_return_at,
                            unit_price, periods, discount_percent, signature_file_id, signed_at, terms_accepted)
values ('a0000000-0000-0000-0000-000000000085', '20000000-0000-0000-0000-000000000085',
        '60000000-0000-0000-0000-000000000085', '90000000-0000-0000-0000-000000000085',
        now(), now() + interval '3 days', 60, 3, 10, pg_temp.fake_file('signature'), now(), true);

-- Remorque : les 4 côtés suffisent, ni tableau de bord, ni compteur, ni carburant
insert into public.rental_photos (rental_id, phase, slot, file_id)
select 'a0000000-0000-0000-0000-000000000085', 'departure', s::public.rental_photo_slot, pg_temp.fake_file('ro_photo')
from unnest(array['front', 'back', 'left', 'right']) s;
select is(cardinality(public.rental_missing('a0000000-0000-0000-0000-000000000085', 'departure')), 0,
          'Remorque : départ complet sans photo du tableau de bord');

-- Facture préparée à la remise des clés
select lives_ok($$ select public.start_rental('a0000000-0000-0000-0000-000000000085') $$, 'Clés remises');
select results_eq(
  $$ select i.status::text, l.line_type::text, split_part(l.description, ' du ', 1), l.quantity, l.unit_price, r.departure_invoiced_periods
       from public.rentals r
       join public.invoices i on i.id = r.departure_invoice_id
       join public.invoice_lines l on l.invoice_id = i.id
      where r.id = 'a0000000-0000-0000-0000-000000000085' $$,
  $$ values ('draft', 'rental', 'Location Schmitz Cargobull · RM-085-TR', 3::numeric, 54.00::numeric, 3) $$,
  'Facture de départ en brouillon : 3 jours à 54 € HT (remise de 10 %)');
select is((select departure_invoice_status from public.v_rentals_overview where id = 'a0000000-0000-0000-0000-000000000085'),
          'draft'::public.invoice_status, 'Facture de départ dans la liste des contrats');
select throws_ok($$
  update public.rentals set departure_invoice_id = null where id = 'a0000000-0000-0000-0000-000000000085'
$$, '42501', null, 'La facture de départ n''est posée que par la remise des clés');

-- Facture de départ émise : les suppléments partent sur une facture à part
select public.issue_invoice((select departure_invoice_id from public.rentals
                             where id = 'a0000000-0000-0000-0000-000000000085')) as departure_number \gset
insert into public.rental_photos (rental_id, phase, slot, file_id)
select 'a0000000-0000-0000-0000-000000000085', 'return', s::public.rental_photo_slot, pg_temp.fake_file('ro_photo')
from unnest(array['front', 'back', 'left', 'right']) s;
select lives_ok($$ select public.return_rental('a0000000-0000-0000-0000-000000000085', now()) $$,
                'Retour de la remorque sans tableau de bord');
select public.close_rental('a0000000-0000-0000-0000-000000000085', $$[
  {"description": "Forfait nettoyage", "quantity": 1, "unit_price": 40}
]$$::jsonb) as closing \gset
select isnt(:'closing'::uuid, (select departure_invoice_id from public.rentals
                                where id = 'a0000000-0000-0000-0000-000000000085'),
            'Suppléments sur une autre facture que celle du départ');
select results_eq(
  format($$ select description, net_ht from public.invoice_lines where invoice_id = %L $$, :'closing'),
  $$ values ('Forfait nettoyage', 40.00::numeric) $$, 'Seulement les suppléments');

-- Sans supplément : la clôture renvoie la facture du départ
insert into public.rentals (id, client_id, fleet_vehicle_id, driving_license_id, departure_at, planned_return_at,
                            unit_price, periods, signature_file_id, signed_at, terms_accepted)
values ('a0000000-0000-0000-0000-000000000086', '20000000-0000-0000-0000-000000000085',
        '60000000-0000-0000-0000-000000000085', '90000000-0000-0000-0000-000000000085',
        now() + interval '5 days', now() + interval '6 days', 60, 1, pg_temp.fake_file('signature'), now(), true);
select is((select departure_invoice_id from public.rentals where id = 'a0000000-0000-0000-0000-000000000086'), null,
          'Pas de facture avant la remise des clés');

select * from finish();
rollback;
