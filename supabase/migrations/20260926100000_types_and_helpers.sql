-- =============================================================================
-- RTS Atelier — 01. Extensions, types énumérés et fonctions utilitaires
-- =============================================================================
-- Conventions du schéma :
--   * identifiants SQL en anglais (snake_case), commentaires et libellés en français ;
--   * clés primaires uuid ; dates en timestamptz (instants) ou date (jours) ;
--   * montants en numeric(12,2), jamais de float ; taux de TVA stocké par ligne ;
--   * colonne legacy_id sur les tables alimentées par la migration Firestore
--     (rend le script de migration rejouable sans doublons).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Types énumérés
-- ---------------------------------------------------------------------------

-- Rôle applicatif d'un compte. Un technicien qui a aussi un accès bureau a le
-- rôle 'direction' ou 'reception' ET une fiche dans public.technicians.
-- 'kiosk' = compte dédié à la borne de pointage / à l'écran atelier (télé).
create type public.app_role as enum ('direction', 'reception', 'technician', 'kiosk');

create type public.vehicle_type as enum ('pl', 'vul', 'remorque');

-- Catégorie de main d'œuvre (détermine le taux horaire).
create type public.labor_category as enum ('pl', 'vul', 'remorque', 'tolerie');

-- Cycle de vie d'un ordre de réparation (OR).
--   assigned      = Assigné            in_progress = En cours
--   work_done     = Terminé atelier    quote_pending = Devis à faire
--   to_invoice    = Facture à faire    invoiced    = Facturé
create type public.repair_order_status as enum (
  'assigned', 'in_progress', 'work_done', 'quote_pending', 'to_invoice', 'invoiced'
);

create type public.intervention_type as enum ('workshop', 'roadside');

-- Ligne d'OR : travaux effectués ('done') ou travaux / pièces à prévoir ('planned').
create type public.ro_line_kind as enum ('done', 'planned');

-- Nature d'une ligne (OR, devis, facture).
create type public.line_type as enum (
  'labor',        -- main d'œuvre
  'package',      -- forfait
  'part',         -- pièce
  'consumable',   -- consommable en vrac (huile, AdBlue…)
  'subcontract',  -- sous-traitance refacturée
  'travel',       -- déplacement / dépannage
  'text'          -- ligne de texte libre (non chiffrée)
);

create type public.part_order_status as enum ('to_order', 'ordered', 'received');

-- draft = À faire, in_progress = En cours, sent = Envoyé, accepted = Accepté, refused = Refusé
create type public.quote_status as enum ('draft', 'in_progress', 'sent', 'accepted', 'refused');
create type public.quote_section as enum ('done', 'planned');
-- Travaux déjà effectués présents sur un devis accepté : offerts ou facturés à part.
create type public.done_line_decision as enum ('offered', 'billed');

create type public.invoice_status as enum ('draft', 'issued');

create type public.payment_method as enum (
  'bank_transfer', 'check', 'card', 'cash', 'bill_of_exchange', 'direct_debit'
);

create type public.subcontract_status as enum ('sent', 'returned');
create type public.appointment_status as enum ('planned', 'converted', 'cancelled');
create type public.warranty_status as enum ('to_return', 'sent', 'accepted', 'refused', 'refunded');

create type public.clock_event_type as enum ('in', 'out');
create type public.clock_source as enum ('kiosk', 'manual');
create type public.leave_type as enum ('paid_leave', 'sick', 'training', 'other');
create type public.leave_status as enum ('requested', 'approved', 'rejected');
create type public.rest_group as enum ('A', 'B');

create type public.client_message_type as enum (
  'vehicle_received', 'quote_available', 'vehicle_ready', 'appointment_reminder',
  'quote_link', 'invoice_link', 'invoice_reminder', 'portal_link'
);
create type public.message_channel as enum ('email', 'sms', 'other');

create type public.consumable_movement_reason as enum ('usage', 'usage_cancel', 'restock', 'adjustment');

create type public.file_category as enum (
  'ro_photo', 'signature', 'registration_doc', 'clock_photo', 'document_pdf', 'label_scan', 'logo', 'other'
);

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires génériques
-- ---------------------------------------------------------------------------

-- Met à jour updated_at à chaque modification (branché sur toutes les tables
-- qui possèdent cette colonne, cf. migration des fonctions métier).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Clé de rapprochement : majuscules, uniquement A-Z et 0-9.
-- « AB-123-cd » -> « AB123CD ». Même règle que l'ancienne appli (plateKey / clientKey).
create or replace function public.normalize_key(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Montant net HT d'une ligne : prix × quantité × (1 − remise %), arrondi au centime.
create or replace function public.line_net_ht(
  p_line_type public.line_type,
  p_unit_price numeric,
  p_quantity numeric,
  p_discount_percent numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select case
    when p_line_type = 'text' then 0::numeric
    else round(coalesce(p_unit_price, 0) * coalesce(p_quantity, 1) * (1 - coalesce(p_discount_percent, 0) / 100), 2)
  end;
$$;

-- Jeton public (lien de devis, facture en ligne, espace client) : 32 octets aléatoires
-- cryptographiquement sûrs, encodés en hexadécimal (64 caractères).
create or replace function public.generate_public_token()
returns text
language sql
volatile
as $$
  select encode(extensions.gen_random_bytes(32), 'hex');
$$;

-- Jour calendaire à Paris pour un instant donné (pointages, alertes).
create or replace function public.paris_date(p_at timestamptz)
returns date
language sql
stable
as $$
  select (p_at at time zone 'Europe/Paris')::date;
$$;
