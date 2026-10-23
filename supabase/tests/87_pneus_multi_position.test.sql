-- =============================================================================
-- Pneumatiques : profil multi-positions (poids lourd), indice de charge facultatif
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

\ir helpers/fixtures.psql

delete from public.notifications where type = 'low_stock';
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');  -- réception

select lives_ok($$ select public.add_tires('pl', '38565225', 'multi', 'Michelin', 'X Multi', 'neuf', 2, 300, 400) $$,
                'Poids lourd : profil multi-positions, sans indice de charge');
select is((select l.profile::text || ' ' || coalesce(t.load_index, 'sans indice')
           from public.tires t join public.tire_lines l on l.id = t.line_id where t.model = 'X Multi'),
          'multi sans indice', 'Lot gardé en multi-positions, indice vide');
select throws_like($$ select public.add_tires('vul', '2356516', 'multi', 'Michelin', 'Agilis', 'neuf', 2, 90, 120) $$,
                   '%Profil invalide%', 'Utilitaire : toutes positions seulement');

-- Seuil relevé au-dessus du stock : alerte avec le libellé du profil
update public.tire_lines set min_qty = 4 where size_key = '38565225' and profile = 'multi';
reset role;
select is((select title from public.notifications where type = 'low_stock' and recipient_role = 'reception' limit 1),
          'Pneus à commander : 385/65 R22.5 multi-positions', 'Alerte : taille et profil multi-positions');

select * from finish();
rollback;
