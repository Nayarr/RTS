-- =============================================================================
-- Adresses d'envoi des e-mails par type de message
--
-- La direction règle le domaine d'envoi (vérifié chez Resend) et le début de chaque adresse :
--   * facturation@… : devis, factures, relances, contrats de location envoyés ;
--   * atelier@…     : véhicule pris en charge / prêt, devis disponible, rappels, espace client ;
--   * signature@…   : liens de signature (OR, contrat de location).
-- Les réponses du client reviennent sur l'adresse qui a envoyé le message.
-- Sans domaine réglé : adresse unique du secret MAIL_FROM (comme avant).
-- =============================================================================

alter table public.app_settings
  add column mail_domain text
    check (mail_domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'),
  add column mail_billing_local text not null default 'facturation'
    check (mail_billing_local ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'),
  add column mail_workshop_local text not null default 'atelier'
    check (mail_workshop_local ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'),
  add column mail_signature_local text not null default 'signature'
    check (mail_signature_local ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$');
comment on column public.app_settings.mail_domain is
  'Domaine d''envoi des e-mails (vérifié chez Resend), ex. rapidtruckservice.fr.';

-- Journal : adresse qui a envoyé l'e-mail
alter table public.email_deliveries add column sender text;
