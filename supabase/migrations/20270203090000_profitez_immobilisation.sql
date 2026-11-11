-- « Profitez de l'immobilisation » : libellé du mail des échéances dans l'historique de l'OR.
-- Ajouté à la dernière version de la fonction (jamais recopiée).
do $$
declare
  v_def text := pg_get_functiondef('public.client_message_label(public.client_message_type)'::regprocedure);
  v_new text;
  v_anchor constant text := '    when ''portal_link'' then ''Espace client''';
begin
  v_new := replace(v_def, v_anchor, v_anchor || chr(10) || '    when ''upcoming_work'' then ''Échéances proposées''');
  if v_new = v_def then
    raise exception 'client_message_label : texte introuvable (%)', v_anchor;
  end if;
  execute v_new;
end;
$$;
