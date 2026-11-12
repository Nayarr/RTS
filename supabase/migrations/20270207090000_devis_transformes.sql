-- Devis acceptés dont l'OR est déjà créé : ils passent dans « Transformés en OR », pour que
-- « Accepté » ne liste que les devis à transformer. Nouvelle colonne order_created de la vue :
--   * OR créé depuis le devis accepté (resulting_repair_order_id) ;
--   * devis rattaché à un OR existant (merged_into_repair_order_id) ;
--   * devis libre transformé en OR (l'OR rattaché vient du devis : origin_quote_id).

do $migration$
declare
  v_def text := pg_get_viewdef('public.v_quotes_overview'::regclass, true);
  v_old text := $old$    t.total_ttc
   FROM$old$;
  v_new text := $new$    t.total_ttc,
    q.resulting_repair_order_id IS NOT NULL OR q.merged_into_repair_order_id IS NOT NULL
      OR r.origin_quote_id IS NOT DISTINCT FROM q.id AND r.id IS NOT NULL AS order_created
   FROM$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans v_quotes_overview : %', v_old;
  end if;
  execute 'create or replace view public.v_quotes_overview with (security_invoker = on) as '
          || replace(v_def, v_old, v_new);
end;
$migration$;

-- Tableau de bord : « Devis acceptés à transformer en OR » ne compte plus les devis libres déjà transformés.
do $migration$
declare
  v_def text := pg_get_functiondef('public.office_dashboard'::regproc);
  v_old text := $old$      select count(*) from public.quotes
      where status = 'accepted' and resulting_repair_order_id is null and merged_into_repair_order_id is null),$old$;
  v_new text := $new$      select count(*) from public.v_quotes_overview where status = 'accepted' and not order_created),$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans office_dashboard : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
