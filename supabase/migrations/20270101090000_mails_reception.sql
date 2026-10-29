-- =============================================================================
-- Mails reçus ouverts à la réception
--
-- Demande du client : la réception a accès aux mails reçus par les boîtes de l'atelier, comme la
-- direction : liste triée par l'agent, lecture, mail coché traité, réponse préparée relue,
-- envoyée ou remise à plus tard. Le réglage des boîtes reste à la direction.
-- =============================================================================

alter policy inbox_emails_select on public.inbox_emails using ((select public.is_office()));
alter policy inbox_webhook_status_select on public.inbox_webhook_status using ((select public.is_office()));

CREATE OR REPLACE FUNCTION public.postpone_inbox_reply(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  update public.inbox_emails set reply_status = 'postponed'
  where id = p_id and reply_status = 'ready';
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_inbox_emails_handled(p_ids uuid[], p_handled boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer;
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  update public.inbox_emails
  set handled_at = case when p_handled then now() end,
      handled_by = case when p_handled then auth.uid() end
  where id = any (p_ids) and (handled_at is null) = p_handled;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;
