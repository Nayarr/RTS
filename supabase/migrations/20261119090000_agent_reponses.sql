-- =============================================================================
-- RTS Atelier : réponses préparées par l'Agent Direction
--
-- Un mail trié « réponse attendue » reçoit une réponse préparée par Claude Sonnet, qui lit les
-- données de l'atelier (client, véhicule, OR, planning, factures) avant d'écrire. Le point du jour
-- résume chaque mail, dicte la réponse et propose de l'envoyer : rien ne part sans l'accord de la
-- direction (bouton ou « envoie » à la voix), depuis la boîte atelier@, dans le fil du client.
--
-- Le point du jour est désormais rangé en phrases (étiquette, texte, urgent) pour être lu phrase
-- par phrase et relu après écoute.
-- =============================================================================

alter table public.inbox_emails
  add column reply_status        text not null default 'none'
    check (reply_status in ('none', 'pending', 'ready', 'failed', 'postponed', 'sent')),
  add column reply_attempts      smallint not null default 0,
  -- Ce que demande l'expéditeur, en deux phrases faites pour être écoutées
  add column reply_request       text check (char_length(reply_request) <= 1000),
  add column reply_subject       text check (char_length(reply_subject) <= 200),
  add column reply_body          text check (char_length(reply_body) <= 5000),
  -- Données de l'atelier sur lesquelles s'appuie la réponse (« Bruno libre de 14 h à 17 h »)
  add column reply_basis         text check (char_length(reply_basis) <= 500),
  add column reply_tools         text[] not null default '{}',
  add column reply_input_tokens  integer not null default 0,
  add column reply_output_tokens integer not null default 0,
  add column reply_prepared_at   timestamptz,
  add column reply_sent_at       timestamptz,
  add column reply_sent_by       uuid references public.profiles (id) on delete set null,
  add column reply_provider_id   text;
create index inbox_emails_reply_pending_idx on public.inbox_emails (created_at) where reply_status = 'pending';
comment on column public.inbox_emails.reply_status is
  'Réponse préparée : none (aucune), pending (en préparation), ready (à relire), failed, postponed (plus tard), sent.';

alter table public.agent_briefings
  add column phrases jsonb not null default '[]'::jsonb check (jsonb_typeof(phrases) = 'array');
comment on column public.agent_briefings.phrases is
  'Phrases du point du jour : [{ "etiquette", "texte", "urgent" }], lues une par une.';

-- ---------------------------------------------------------------------------
-- Réponse remise à plus tard (« plus tard » à la voix ou par le bouton)
-- ---------------------------------------------------------------------------
create function public.postpone_inbox_reply(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_direction() then
    raise exception 'Réservé à la direction' using errcode = '42501';
  end if;
  update public.inbox_emails set reply_status = 'postponed'
  where id = p_id and reply_status = 'ready';
  return found;
end;
$$;

revoke execute on function public.postpone_inbox_reply(uuid) from public, anon;
grant execute on function public.postpone_inbox_reply(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tâche de secours : mails pas encore triés et réponses pas encore préparées
-- ---------------------------------------------------------------------------
create or replace function public.retry_inbox_triage()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending integer;
begin
  -- Abandon après 3 essais ou 2 jours : le mail reste lisible, sans tri ni réponse préparée
  update public.inbox_emails set triage_status = 'failed'
  where triage_status = 'pending' and (triage_attempts >= 3 or created_at < now() - interval '2 days');
  update public.inbox_emails set reply_status = 'failed'
  where reply_status = 'pending' and (reply_attempts >= 3 or created_at < now() - interval '2 days');

  select count(*) into v_pending from public.inbox_emails
  where (triage_status = 'pending' or reply_status = 'pending') and created_at < now() - interval '5 minutes';
  if v_pending > 0 then
    perform public.invoke_edge_function('mail-inbox', '{"triage": true}'::jsonb);
  end if;
  return v_pending;
end;
$$;

revoke execute on function public.retry_inbox_triage() from public, anon, authenticated;
