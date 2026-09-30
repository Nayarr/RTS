-- =============================================================================
-- Données de DÉVELOPPEMENT LOCAL uniquement.
-- Appliquées par `supabase db reset` en local ; jamais envoyées en production
-- (`supabase db push` n'exécute pas ce fichier).
--
-- Comptes de test (mot de passe commun : atelier-dev-2026)
--   direction@rts.local   Direction
--   reception@rts.local   Réception
--   alice@rts.local       Technicienne (Alice)
--   bruno@rts.local       Technicien (Bruno)
--   borne@rts.local       Borne de pointage / écran atelier
-- =============================================================================

with accounts (id, email, full_name, role) as (
  values
    ('5eed0000-0000-0000-0000-000000000001'::uuid, 'direction@rts.local', 'Direction RTS', 'direction'::public.app_role),
    ('5eed0000-0000-0000-0000-000000000002'::uuid, 'reception@rts.local', 'Réception RTS', 'reception'::public.app_role),
    ('5eed0000-0000-0000-0000-000000000003'::uuid, 'alice@rts.local', 'Alice Martin', 'technician'::public.app_role),
    ('5eed0000-0000-0000-0000-000000000004'::uuid, 'bruno@rts.local', 'Bruno Petit', 'technician'::public.app_role),
    ('5eed0000-0000-0000-0000-000000000005'::uuid, 'borne@rts.local', 'Borne atelier', 'kiosk'::public.app_role)
),
new_users as (
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
         extensions.crypt('atelier-dev-2026', extensions.gen_salt('bf')), now(),
         '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
  from accounts
  returning id, email
),
new_identities as (
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), id, id::text,
         jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
         'email', now(), now(), now()
  from new_users
  returning user_id
)
insert into public.profiles (id, email, full_name, role)
select a.id, a.email, a.full_name, a.role
from accounts a
join new_users u on u.id = a.id;

insert into public.technicians (profile_id, display_name, color) values
  ('5eed0000-0000-0000-0000-000000000003', 'Alice', '#2A6B52'),
  ('5eed0000-0000-0000-0000-000000000004', 'Bruno', '#4750B5');

-- Catalogues (stock de départ passé par le journal des mouvements)
insert into public.suppliers (id, name) values
  ('41000000-0000-0000-0000-000000000001', 'PL Pièces 95'),
  ('41000000-0000-0000-0000-000000000002', 'Rectif Service');

insert into public.consumables (id, name, unit, sale_price, purchase_price, alert_threshold) values
  ('91000000-0000-0000-0000-000000000001', 'Huile moteur 10W40', 'L', 6.50, 3.20, 40),
  ('91000000-0000-0000-0000-000000000002', 'AdBlue', 'L', 1.20, 0.45, 100),
  ('91000000-0000-0000-0000-000000000003', 'Liquide de refroidissement', 'L', 4.80, 2.10, null);

insert into public.consumable_movements (consumable_id, quantity, reason, note) values
  ('91000000-0000-0000-0000-000000000001', 208, 'restock', 'Stock de départ'),
  ('91000000-0000-0000-0000-000000000002', 60, 'restock', 'Stock de départ'),
  ('91000000-0000-0000-0000-000000000003', 50, 'restock', 'Stock de départ');

insert into public.parts (designation, brand, manufacturer_ref, oem_ref, supplier_id, purchase_price, sale_price) values
  ('Plaquettes de frein avant (jeu)', 'Knorr-Bremse', 'K-II37', '81508206095', '41000000-0000-0000-0000-000000000001', 92.00, 138.00),
  ('Filtre à huile', 'Mann-Filter', 'HU 12 140 x', '51055040108', '41000000-0000-0000-0000-000000000001', 21.50, 32.00),
  ('Disque de frein arrière', 'SBP', '02-MA010', '81508030037', '41000000-0000-0000-0000-000000000001', 118.00, 165.00);

-- Tâches planifiées → Edge Functions (purge des fichiers, notifications) : adresse de l'API
-- vue depuis la base (réseau Docker local) et secret partagé avec les fonctions
-- (CRON_SECRET dans config.toml). En production, ces deux secrets sont créés à la main.
select vault.create_secret('http://supabase_kong_rts-atelier:8000', 'project_url');
select vault.create_secret('rts-local-cron-secret-0000', 'cron_secret');
