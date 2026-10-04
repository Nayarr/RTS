-- =============================================================================
-- Envoi des e-mails par l'appli (Resend)
--
-- Réglage de la direction « Envoyer les e-mails depuis l'appli » : le message préparé
-- (devis, facture, signature, contrat, rappel…) part directement par l'Edge Function
-- « mail-send » (service Resend, expéditeur au nom de l'atelier, réponses vers l'e-mail
-- de l'atelier), sans ouvrir la messagerie de l'ordinateur. Sans réglage ou sans clé,
-- les liens vers la messagerie restent disponibles comme avant.
-- Chaque e-mail parti est gardé dans le journal email_deliveries (lisible par le bureau).
-- =============================================================================

alter table public.app_settings
  add column mail_send_enabled boolean not null default false;
comment on column public.app_settings.mail_send_enabled is
  'Envoi des e-mails directement par l''appli (Resend) ; sinon par la messagerie de l''ordinateur.';

create table public.email_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  provider_message_id  text,                       -- identifiant Resend (suivi de délivrance)
  recipient            text not null,
  subject              text not null,
  attachments          text[] not null default '{}'::text[],   -- noms des pièces jointes
  sent_by              uuid references public.profiles (id) on delete set null,
  sent_at              timestamptz not null default now()
);
create index email_deliveries_sent_idx on public.email_deliveries (sent_at desc);
comment on table public.email_deliveries is
  'E-mails envoyés par l''appli (Resend) : destinataire, objet, pièces jointes, auteur.';

-- Écriture uniquement par l'Edge Function (clé de service) ; lecture : le bureau.
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public, anon, authenticated;
grant select on public.email_deliveries to authenticated;
create policy email_deliveries_select on public.email_deliveries for select to authenticated
  using (public.is_office());
