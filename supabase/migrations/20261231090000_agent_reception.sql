-- =============================================================================
-- Agent Direction ouvert à la réception, en lecture seule sauf les mails
--
-- Demande du client : la réception utilise l'agent en lecture seule ; la seule écriture permise
-- est la préparation et l'envoi de mails (un mail, ou un mail par client). Les autres actions
-- (rendez-vous, OR, échéances, factures) restent à la direction ; la réception n'en prépare
-- aucune. Ses lectures suivent ses droits dans l'appli (Edge Function « agent ») ; les mails
-- reçus restent à la direction.
-- =============================================================================

-- Conversations, échanges et point du jour : chacun les siens, direction ou réception
alter policy agent_conversations_select on public.agent_conversations
  using (profile_id = (select auth.uid()) and (select public.is_office()));
alter policy agent_conversations_delete on public.agent_conversations
  using (profile_id = (select auth.uid()) and (select public.is_office()));
alter policy agent_turns_select on public.agent_turns
  using (profile_id = (select auth.uid()) and (select public.is_office()));
alter policy agent_briefings_select on public.agent_briefings
  using (profile_id = (select auth.uid()) and (select public.is_office()));

-- Actions préparées : la réception ne prépare que des mails
alter policy agent_actions_select on public.agent_actions
  using (public.is_office() and profile_id = auth.uid());
alter policy agent_actions_insert on public.agent_actions
  with check (public.is_office() and profile_id = auth.uid() and status = 'proposed' and result is null
              and error is null and decided_at is null and (public.is_direction() or kind = 'send_mail'));

-- Mail préparé : modifié ou écarté par la personne qui l'a demandé (direction ou réception).
-- Les autres actions restent validées par la direction seule (execute_agent_action inchangée).
CREATE OR REPLACE FUNCTION public.cancel_agent_action(p_action_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  update public.agent_actions set status = 'cancelled', decided_at = now()
   where id = p_action_id and profile_id = auth.uid() and status = 'proposed';
end;
$function$;

CREATE OR REPLACE FUNCTION public.edit_agent_mail(p_action_id uuid, p_to text, p_subject text, p_text text)
 RETURNS agent_actions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_action public.agent_actions;
  v_to text := lower(btrim(coalesce(p_to, '')));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_text text := btrim(coalesce(p_text, ''));
begin
  if not public.is_office() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;
  select * into v_action from public.agent_actions
   where id = p_action_id and profile_id = auth.uid() for update;
  if not found or v_action.kind <> 'send_mail' then
    raise exception 'Mail préparé introuvable' using errcode = 'P0002';
  end if;
  if v_action.status <> 'proposed' then
    raise exception 'Mail déjà envoyé ou écarté' using errcode = 'P0001';
  end if;
  if v_to !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    raise exception 'Adresse e-mail invalide' using errcode = '22023';
  end if;
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'Objet du mail : 1 à 200 caractères' using errcode = '22023';
  end if;
  if char_length(v_text) not between 1 and 5000 then
    raise exception 'Texte du mail : 1 à 5 000 caractères' using errcode = '22023';
  end if;

  update public.agent_actions
     set payload = payload || jsonb_build_object('to', v_to, 'subject', v_subject, 'text', v_text, 'edited', true),
         summary = left(
           case when jsonb_array_length(coalesce(payload -> 'invoice_ids', '[]'::jsonb)) > 0 then 'Relance' else 'Mail' end
           || ' à ' || coalesce((payload ->> 'client_name') || ' (' || v_to || ')', v_to)
           || ' : « ' || v_subject || ' »', 500)
   where id = p_action_id
  returning * into v_action;
  return v_action;
end;
$function$;
