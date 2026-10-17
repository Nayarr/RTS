-- =============================================================================
-- Saisie des OR : heures arrondies à l'heure supérieure au devis et à la facture, récapitulatif
-- des travaux sans « Fournitures et recyclage », contrôle hayon à 0,5 h par défaut
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

\ir helpers/fixtures.psql

update public.company_settings set supplies_fee_ht = 15;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

-- ---------------------------------------------------------------- Heures facturées
select id as quote from public.create_quote('Transports Dupont', 'AB-123-CD', 'pl') \gset
insert into public.quote_lines (quote_id, line_type, description, unit_price, quantity)
values (:'quote', 'labor', 'Remplacement plaquettes', 90, 1.5),
       (:'quote', 'part', 'Plaquettes', 40, 1.5);
select is((select quantity from public.quote_lines where quote_id = :'quote' and line_type = 'labor'), 2.00::numeric,
          'Devis : 1,5 h de main d''œuvre → 2 h');
select is((select quantity from public.quote_lines where quote_id = :'quote' and line_type = 'part'), 1.50::numeric,
          'Les pièces gardent leur quantité');
update public.quote_lines set quantity = 2.2 where quote_id = :'quote' and line_type = 'labor';
select is((select quantity from public.quote_lines where quote_id = :'quote' and line_type = 'labor'), 3.00::numeric,
          'Modification : 2,2 h → 3 h');

-- ---------------------------------------------------------------- OR issu du devis
select ok((select count(*) from public.quote_lines where quote_id = :'quote' and description = 'Fournitures et recyclage') = 1,
          'Le devis porte la ligne « Fournitures et recyclage »');
select public.set_quote_response(:'quote', 'accepted');
select public.create_repair_order_from_quote(:'quote', null) as ro \gset
select is((select requested_work from public.repair_orders where id = :'ro'), 'Remplacement plaquettes
Plaquettes', 'Travaux de l''OR : sans « Fournitures et recyclage »');

-- ---------------------------------------------------------------- Contrôle hayon
insert into public.ro_lines (repair_order_id, kind, position, line_type, description)
values (:'ro', 'planned', 50, 'labor', 'Contrôle hayon'),
       (:'ro', 'planned', 51, 'labor', 'Graissage');
select is((select estimated_hours from public.ro_lines where repair_order_id = :'ro' and description = 'Contrôle hayon'),
          null, 'Contrôle hayon à prévoir : pas de temps mis d''office (estimé par le technicien)');
select is((select estimated_hours from public.ro_lines where repair_order_id = :'ro' and description = 'Graissage'),
          null, 'Autre réparation : pas de temps imposé');

select * from finish();
rollback;
