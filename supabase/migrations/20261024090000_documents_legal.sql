-- =============================================================================
-- RTS Atelier : Mentions et validité des documents (audit)
--
--   - une facture n'est émise qu'avec l'adresse de facturation du client (mention
--     obligatoire entre professionnels) ; le SIREN reste un avertissement dans l'appli ;
--   - un devis expiré ne peut plus être signé en ligne (le bureau peut toujours
--     enregistrer un accord à la main).
-- =============================================================================

create or replace function public.invoices_legal_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_migration_context() or old.status <> 'draft' or new.status <> 'issued' then
    return new;
  end if;
  if coalesce(btrim(new.client_address), '') = '' then
    raise exception 'Renseigne l''adresse de facturation du client (%) avant d''émettre la facture',
      coalesce(new.client_name, 'client') using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.invoices_legal_mentions() from public, anon, authenticated;

create trigger invoices_legal_mentions
  before update on public.invoices
  for each row execute function public.invoices_legal_mentions();

-- Signature en ligne : même fonction qu'avant, avec le contrôle de la date de validité.
create or replace function public.public_respond_quote(
  p_token text,
  p_accept boolean,
  p_signer_name text,
  p_signature_file_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_title text;
  v_body text;
begin
  select * into v_quote from public.quotes where public_token = p_token for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_quote.status in ('accepted', 'refused') then
    raise exception 'Ce devis a déjà reçu une réponse' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Ce devis n''est pas ouvert à la signature' using errcode = 'P0001';
  end if;
  -- Devis expiré : le client ne peut plus le signer en ligne (anciens prix).
  if v_quote.valid_until is not null and v_quote.valid_until < public.paris_date(now()) then
    raise exception 'Ce devis a expiré le % : contactez l''atelier pour une nouvelle proposition',
      to_char(v_quote.valid_until, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  if p_accept then
    if coalesce(btrim(p_signer_name), '') = '' or p_signature_file_id is null then
      raise exception 'Nom et signature obligatoires pour accepter le devis' using errcode = '22023';
    end if;
    update public.quotes
       set status = 'accepted', accepted_at = now(), accepted_by_name = btrim(p_signer_name),
           signature_file_id = p_signature_file_id
     where id = v_quote.id;
  else
    update public.quotes
       set status = 'refused', refused_at = now(), accepted_by_name = nullif(btrim(p_signer_name), '')
     where id = v_quote.id;
  end if;

  if v_quote.repair_order_id is not null then
    insert into public.ro_events (repair_order_id, label)
    values (v_quote.repair_order_id,
            'Devis ' || v_quote.number || ' ' || case when p_accept then 'accepté' else 'refusé' end
            || ' en ligne par le client' || coalesce(' (' || nullif(btrim(p_signer_name), '') || ')', ''));
  end if;

  v_title := 'Devis ' || v_quote.number || ' ' || case when p_accept then 'accepté' else 'refusé' end || ' en ligne';
  select coalesce(c.name, '') || coalesce(' · ' || v.plate, '') into v_body
  from public.quotes q left join public.clients c on c.id = q.client_id left join public.vehicles v on v.id = q.vehicle_id
  where q.id = v_quote.id;

  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  values
    ('direction', 'quote_response', v_title, v_body, v_quote.repair_order_id, '/devis/' || v_quote.id, 'quote-response-' || v_quote.id || '-direction'),
    ('reception', 'quote_response', v_title, v_body, v_quote.repair_order_id, '/devis/' || v_quote.id, 'quote-response-' || v_quote.id || '-reception')
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object('status', case when p_accept then 'accepted' else 'refused' end);
end;
$$;
