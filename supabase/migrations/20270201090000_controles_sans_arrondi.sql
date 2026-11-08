-- =============================================================================
-- RTS Atelier : étiquettes et extincteurs facturés au temps saisi, sans arrondi à l'heure
--
-- - La main d'œuvre des devis et des factures reste à l'heure entamée (0,5 h → 1 h), sauf pour les
--   petits travaux de la fiche de contrôle : étiquettes angles morts, étiquette contrôle hayon,
--   extincteurs. Le technicien y met 0,5 h : 0,5 h est facturée.
-- - Ces lignes sont reconnues comme pour le temps barème (keeps_standard_time).
-- =============================================================================

-- Appelée par le déclencheur des lignes, avec les droits de la personne qui enregistre
grant execute on function public.keeps_standard_time(text) to authenticated;

do $migration$
declare
  v_def text := pg_get_functiondef('public.round_labor_hours()'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'if new.line_type = ''labor'' then',
    '-- Étiquettes (angles morts, contrôle hayon) et extincteurs : temps saisi, sans arrondi
  if new.line_type = ''labor'' and not public.keeps_standard_time(new.description) then');
  if v_new = v_def then
    raise exception 'round_labor_hours : texte attendu introuvable, migration à revoir';
  end if;
  execute v_new;
end;
$migration$;
