-- =============================================================================
-- Forfaits de barres en VUL désactivés, ceux des PL et le kit accessoires VUL gardés
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

\ir helpers/fixtures.psql

select is((select count(*)::int from public.service_packages
           where is_active and category = 'vul' and (trigger_fields && array['barre_accouplement', 'barre_direction']
                 or name ilike '%barre%accouplement%' or name ilike '%barre%direction%')), 0,
          'Plus de forfait de barre actif pour les VUL');
select ok(exists (select 1 from public.service_packages where is_active and category = 'pl'
                  and trigger_fields = array['barre_direction']), 'Forfait barre de direction PL gardé');
select ok(exists (select 1 from public.service_packages where is_active and category = 'vul'
                  and trigger_fields = array['kit_accessoires']), 'Forfait kit accessoires VUL gardé');

select * from finish();
rollback;
