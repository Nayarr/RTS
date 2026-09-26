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
