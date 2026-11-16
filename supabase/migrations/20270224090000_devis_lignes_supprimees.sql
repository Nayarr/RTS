-- Devis préparé depuis un OR : une ligne supprimée du devis ne revient plus.
-- « Reprendre le devis » (build_quote_from_repair_order) recopie les lignes de l'OR absentes du devis,
-- pour y ajouter ce que l'atelier a trouvé depuis : une ligne retirée à la main du devis revenait donc
-- à chaque reprise. Le devis garde la liste des lignes d'OR retirées (et le déplacement retiré), que la
-- reprise ne recopie plus. Les lignes ajoutées à l'OR après coup arrivent toujours.

alter table public.quotes
  add column removed_ro_line_ids uuid[] not null default '{}'::uuid[],
  add column roadside_line_removed boolean not null default false;
comment on column public.quotes.removed_ro_line_ids is
  'Lignes de l''OR retirées à la main de ce devis : « Reprendre le devis » ne les recopie plus.';
comment on column public.quotes.roadside_line_removed is
  'Déplacement du dépannage retiré à la main de ce devis : pas remis à la reprise.';

create function public.quote_lines_remember_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source_ro_line_id is not null then
    update public.quotes
       set removed_ro_line_ids = array_append(removed_ro_line_ids, old.source_ro_line_id)
     where id = old.quote_id and not (old.source_ro_line_id = any (removed_ro_line_ids));
  elsif old.line_type = 'travel' then
    update public.quotes set roadside_line_removed = true where id = old.quote_id;
  end if;
  return null;
end;
$$;
revoke execute on function public.quote_lines_remember_removed() from public, anon, authenticated;

create trigger quote_lines_remember_removed
  after delete on public.quote_lines
  for each row execute function public.quote_lines_remember_removed();

-- Reprise du devis : lignes retirées et déplacement retiré laissés de côté
do $migration$
declare
  v_def text := pg_get_functiondef('public.build_quote_from_repair_order'::regproc);
  v_old_lines text := $old$    and not exists (select 1 from public.quote_lines ql where ql.quote_id = v_quote_id and ql.source_ro_line_id = l.id);$old$;
  v_new_lines text := $new$    and not exists (select 1 from public.quote_lines ql where ql.quote_id = v_quote_id and ql.source_ro_line_id = l.id)
    -- Ligne retirée à la main du devis : elle ne revient pas
    and not (l.id = any (select unnest(q.removed_ro_line_ids) from public.quotes q where q.id = v_quote_id));$new$;
  v_old_travel text := $old$     and not exists (select 1 from public.quote_lines where quote_id = v_quote_id and line_type = 'travel') then$old$;
  v_new_travel text := $new$     and not exists (select 1 from public.quote_lines where quote_id = v_quote_id and line_type = 'travel')
     and not (select q.roadside_line_removed from public.quotes q where q.id = v_quote_id) then$new$;
begin
  if position(v_old_lines in v_def) = 0 then
    raise exception 'Texte introuvable dans build_quote_from_repair_order : %', v_old_lines;
  end if;
  if position(v_old_travel in v_def) = 0 then
    raise exception 'Texte introuvable dans build_quote_from_repair_order : %', v_old_travel;
  end if;
  execute replace(replace(v_def, v_old_lines, v_new_lines), v_old_travel, v_new_travel);
end;
$migration$;
