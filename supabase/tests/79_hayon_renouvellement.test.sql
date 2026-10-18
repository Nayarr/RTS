-- =============================================================================
-- Contrôle hayon au devis : échéance du véhicule repoussée à 6 mois après l'émission
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

\ir helpers/fixtures.psql

insert into public.service_packages (id, name, category, standard_hours, price, trigger_fields) values
  ('70000000-0000-0000-0000-000000000791', 'FORFAIT CONTRÔLE HAYON', 'pl', 0.5, 65, array['controles.hayon']);
update public.vehicles set tailgate_due_date = '2026-03-01' where id = '30000000-0000-0000-0000-000000000001';

-- Devis avec le forfait du contrôle hayon, puis envoyé au client
insert into public.quotes (id, client_id, vehicle_id, status) values
  ('60000000-0000-0000-0000-000000000791', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'in_progress'),
  ('60000000-0000-0000-0000-000000000792', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'in_progress');
insert into public.quote_lines (quote_id, position, line_type, description, quantity, unit_price, package_id) values
  ('60000000-0000-0000-0000-000000000791', 0, 'package', 'FORFAIT CONTRÔLE HAYON', 1, 65, '70000000-0000-0000-0000-000000000791'),
  ('60000000-0000-0000-0000-000000000792', 0, 'labor', 'Vidange', 1, 90, null);

select ok(public.is_tailgate_check_line('70000000-0000-0000-0000-000000000791', 'x'), 'Forfait déclenché par la case hayon : contrôle hayon');
select ok(public.is_tailgate_check_line(null, 'Contrôle hayon'), 'Ligne « Contrôle hayon » : contrôle hayon');

update public.quotes set status = 'sent', sent_at = '2026-10-18 10:00+02' where id = '60000000-0000-0000-0000-000000000791';
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          '2027-04-01'::date, 'Devis émis en octobre 2026 : prochain contrôle hayon en avril 2027 (6 mois)');

update public.quotes set sent_at = '2026-12-01 10:00+01' where id = '60000000-0000-0000-0000-000000000791';
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000001'),
          '2027-04-01'::date, 'Renvoi du même devis : échéance inchangée');

-- Devis sans contrôle hayon, accepté au bureau : rien ne change
update public.vehicles set tailgate_due_date = '2026-05-01' where id = '30000000-0000-0000-0000-000000000003';
update public.quotes set status = 'accepted' where id = '60000000-0000-0000-0000-000000000792';
select is((select tailgate_due_date from public.vehicles where id = '30000000-0000-0000-0000-000000000003'),
          '2026-05-01'::date, 'Devis sans contrôle hayon : échéance inchangée');

select * from finish();
rollback;
