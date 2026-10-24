-- =============================================================================
-- Mails reçus : suivi du dernier appel de Resend
--
-- Un mail que la fonction mail-inbox ignore (Agent désactivé, adressé à aucune boîte de l'atelier,
-- signature ou clé Resend refusée) ne laissait aucune trace dans l'appli : la liste restait vide
-- sans explication. Le dernier appel reçu et son résultat sont gardés (une seule ligne), et la page
-- Agent Direction › Mails reçus les affiche à la direction.
-- =============================================================================

create table public.inbox_webhook_status (
  id          boolean primary key default true check (id),
  received_at timestamptz not null default now(),
  result      text not null check (result in (
                'stored', 'duplicate', 'agent_disabled', 'not_atelier', 'bad_signature', 'bad_event',
                'resend_key_missing', 'resend_error', 'error')),
  recipients  text[] not null default '{}' check (cardinality(recipients) <= 10),
  domain      text
);
comment on table public.inbox_webhook_status is
  'Dernier appel du webhook Resend reçu par mail-inbox et son résultat (diagnostic des mails reçus).';
comment on column public.inbox_webhook_status.recipients is
  'Destinataires lus sur le mail ignoré (pour comprendre pourquoi il ne vise aucune boîte de l''atelier).';

alter table public.inbox_webhook_status enable row level security;
revoke all on public.inbox_webhook_status from public, anon, authenticated;
grant select on public.inbox_webhook_status to authenticated;
create policy inbox_webhook_status_select on public.inbox_webhook_status for select to authenticated
  using ((select public.is_direction()));
