-- Borne séparée en deux comptes : la borne de badgeage (rôle kiosk, pointage seulement) et la borne
-- de signature (nouveau rôle, signature des devis et OR par le client présent).
alter type public.app_role add value if not exists 'kiosk_signature';
