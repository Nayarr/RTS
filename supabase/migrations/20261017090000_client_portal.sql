-- =============================================================================
-- RTS Atelier — Espace client en ligne
--   Le lien (share_client_portal) et le contenu (public_get_document) existent
--   déjà. Ajout : changer le lien d'un client, l'ancien cesse aussitôt de
--   fonctionner (lien transmis par erreur à un tiers, par exemple).
-- =============================================================================

create or replace function public.reset_client_portal(p_client_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  perform public.assert_office();
  update public.clients
     set portal_token = public.generate_public_token()
   where id = p_client_id
  returning portal_token into v_token;
  if v_token is null then
    raise exception 'Client introuvable' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;

revoke execute on function public.reset_client_portal(uuid) from public, anon;
grant execute on function public.reset_client_portal(uuid) to authenticated;
