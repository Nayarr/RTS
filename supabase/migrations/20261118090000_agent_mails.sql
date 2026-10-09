-- =============================================================================
-- RTS Atelier : mails reçus triés par l'Agent Direction
--
-- Les boîtes de l'atelier (atelier@…) gardent leurs mails chez o2switch et en renvoient une
-- copie à l'adresse de réception Resend. Resend prévient l'Edge Function « mail-inbox »
-- (webhook signé), qui garde le mail en texte brut et le fait trier par Claude Haiku :
-- catégorie, urgence, résumé d'une ligne, réponse attendue ou non.
--
-- Lus et marqués « traités » par la direction seulement ; écrits par l'Edge Function
-- seulement. Copies effacées après 90 jours (la boîte d'origine garde le mail).
-- =============================================================================

create table public.inbox_emails (
  id               uuid primary key default gen_random_uuid(),
  -- Identifiant du mail chez Resend : un webhook rejoué n'ajoute rien
  provider_id      text not null unique,
  -- En-tête Message-ID : un mail envoyé à deux boîtes de l'atelier n'est gardé qu'une fois
  message_id       text unique,
  mailbox          text,
  from_name        text not null default '',
  from_address     text not null,
  to_addresses     text[] not null default '{}',
  subject          text not null default '' check (char_length(subject) <= 500),
  body             text not null default '' check (char_length(body) <= 20000),
  -- Noms et types des pièces jointes (le contenu n'est pas gardé)
  attachments      jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  received_at      timestamptz not null,
  client_id        uuid references public.clients (id) on delete set null,
  -- Tri par l'agent
  triage_status    text not null default 'pending' check (triage_status in ('pending', 'done', 'failed')),
  triage_attempts  smallint not null default 0,
  category         text check (category in ('devis', 'rendez_vous', 'suivi', 'facturation', 'fournisseur',
                                             'location', 'administratif', 'publicite', 'spam', 'autre')),
  urgency          text check (urgency in ('urgente', 'normale', 'faible')),
  summary          text check (char_length(summary) <= 300),
  needs_reply      boolean,
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  -- Traité par la direction (rangé hors de la liste « à traiter »)
  handled_at       timestamptz,
  handled_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index inbox_emails_received_idx on public.inbox_emails (received_at desc);
create index inbox_emails_pending_idx on public.inbox_emails (created_at) where triage_status = 'pending';
create index inbox_emails_client_idx on public.inbox_emails (client_id) where client_id is not null;
comment on table public.inbox_emails is
  'Copies des mails reçus par les boîtes de l''atelier, triées par l''Agent Direction (90 jours).';

alter table public.inbox_emails enable row level security;
revoke all on public.inbox_emails from public, anon, authenticated;
grant select on public.inbox_emails to authenticated;

create policy inbox_emails_select on public.inbox_emails for select to authenticated
  using ((select public.is_direction()));

-- ---------------------------------------------------------------------------
-- Mails marqués traités (ou remis à traiter) par la direction
-- ---------------------------------------------------------------------------
create function public.set_inbox_emails_handled(p_ids uuid[], p_handled boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_direction() then
    raise exception 'Réservé à la direction' using errcode = '42501';
  end if;
  update public.inbox_emails
  set handled_at = case when p_handled then now() end,
      handled_by = case when p_handled then auth.uid() end
  where id = any (p_ids) and (handled_at is null) = p_handled;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_inbox_emails_handled(uuid[], boolean) from public, anon;
grant execute on function public.set_inbox_emails_handled(uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Tri en secours : mails pas encore triés (service de tri indisponible au moment du webhook)
-- ---------------------------------------------------------------------------
create function public.retry_inbox_triage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
begin
  -- Abandon après 3 essais ou 2 jours : le mail reste lisible, sans tri
  update public.inbox_emails set triage_status = 'failed'
  where triage_status = 'pending' and (triage_attempts >= 3 or created_at < now() - interval '2 days');

  select count(*) into v_pending from public.inbox_emails
  where triage_status = 'pending' and created_at < now() - interval '5 minutes';
  if v_pending > 0 then
    perform public.invoke_edge_function('mail-inbox', '{"triage": true}'::jsonb);
  end if;
  return v_pending;
end;
$$;

revoke execute on function public.retry_inbox_triage() from public, anon, authenticated;

-- Purge de nuit : conversations, points du jour et copies des mails de plus de 90 jours
create or replace function public.purge_agent_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.agent_conversations where updated_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  delete from public.agent_briefings where day < current_date - 90;
  delete from public.inbox_emails where received_at < now() - interval '90 days';
  return v_count;
end;
$$;

revoke execute on function public.purge_agent_conversations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-tri-mails', '*/10 * * * *', 'select public.retry_inbox_triage()');
  else
    raise notice 'pg_cron indisponible : tri de secours des mails non planifié';
  end if;
end;
$$;
