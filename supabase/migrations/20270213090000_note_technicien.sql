-- Petite note pour le technicien, saisie par le bureau à la création de l'OR (ou après) :
-- consigne qui n'est pas une tâche (« clés au bureau », « client attend sur place »…).
-- Le technicien la lit en haut de sa fiche OR ; une note modifiée remet l'OR en « Modifié » chez lui.

alter table public.repair_orders
  add column technician_note text check (char_length(technician_note) <= 1000);
comment on column public.repair_orders.technician_note is
  'Note du bureau pour le technicien (pas une tâche) : affichée en haut de sa fiche OR.';

-- Vue des OR (liste du bureau, fiche du technicien) : note en dernière colonne
do $migration$
declare
  v_def text := pg_get_viewdef('public.v_repair_orders_overview'::regclass);
  v_new text := regexp_replace(v_def, E'\n   FROM (\\(*repair_orders r)', E',\n    r.technician_note\n   FROM \\1');
begin
  if v_new = v_def then
    raise exception 'v_repair_orders_overview : clause FROM introuvable';
  end if;
  execute 'create or replace view public.v_repair_orders_overview with (security_invoker = on) as ' || v_new;
end;
$migration$;

-- Note modifiée : l'OR repasse en « Modifié » pour le technicien
do $migration$
declare
  v_def text := pg_get_functiondef('public.repair_orders_before_update'::regproc);
  v_old text := $old$     or new.requested_work is distinct from old.requested_work then$old$;
  v_new text := $new$     or new.requested_work is distinct from old.requested_work
     or new.technician_note is distinct from old.technician_note then$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans repair_orders_before_update : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

