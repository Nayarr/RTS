-- =============================================================================
-- Plus aucun tiret cadratin dans les textes fabriqués par la base
--
-- Les fonctions qui fabriquent des libellés (historique de l'OR, notifications, messages
-- de la borne, lignes de facture…) sont réécrites telles quelles avec « · » à la place
-- du tiret cadratin entre deux éléments, et « - » ailleurs.
-- =============================================================================

do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%' || chr(8212) || '%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'Caméra indisponible ' || chr(8212) || ' pointage impossible',
                     'Caméra indisponible : pointage impossible');
    v_def := replace(v_def, 'Éclairage ' || chr(8212) || ' ampoules', 'Éclairage, ampoules');
    v_def := replace(v_def, ' ' || chr(8212) || ' ', ' · ');
    v_def := replace(v_def, chr(8212), '-');
    execute v_def;
  end loop;
end;
$$;
