-- Contrôle technique photographié par le technicien : VIN, marque et modèle sur la fiche du véhicule.
-- Constat : la lecture du procès-verbal ne donnait que l'échéance et le VIN, jamais la marque ni le
-- modèle, et la fonction d'enregistrement les refusait. Désormais :
--   - update_vehicle_deadlines accepte brand et model, posés seulement si la fiche n'en a pas encore
--     (une marque ou un modèle déjà saisi par le bureau n'est jamais remplacé) ;
--   - VIN posé sur une fiche sans marque : marque déduite du code constructeur (3 premiers caractères).
--     Le modèle ne se déduit pas du VIN d'un camion européen : il vient de la lecture du document.
-- Table des codes constructeurs : la même que src/lib/vin.ts (à garder identique).

create function public.vin_brand(p_vin text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(left(regexp_replace(coalesce(p_vin, ''), '[\s-]', '', 'g'), 3))
    -- Poids lourds
    when 'VF6' then 'Renault Trucks'
    when 'WDB' then 'Mercedes-Benz'
    when 'W1T' then 'Mercedes-Benz'
    when 'WMA' then 'MAN'
    when 'YS2' then 'Scania'
    when 'XLE' then 'Scania'
    when 'YV2' then 'Volvo'
    when 'XLR' then 'DAF'
    when 'ZCF' then 'Iveco'
    when 'JAL' then 'Isuzu'
    -- Utilitaires
    when 'VF1' then 'Renault'
    when 'VF3' then 'Peugeot'
    when 'VF7' then 'Citroën'
    when 'WDF' then 'Mercedes-Benz'
    when 'W1V' then 'Mercedes-Benz'
    when 'WF0' then 'Ford'
    when 'NM0' then 'Ford'
    when 'ZFA' then 'Fiat'
    when 'WV1' then 'Volkswagen'
    when 'WV2' then 'Volkswagen'
    when 'W0V' then 'Opel'
    -- Remorques et semi-remorques
    when 'WSM' then 'Schmitz Cargobull'
    when 'WKE' then 'Krone'
  end;
$$;
comment on function public.vin_brand(text) is
  'Marque déduite du code constructeur du VIN (3 premiers caractères), sinon null. Même table que src/lib/vin.ts.';
revoke execute on function public.vin_brand(text) from public, anon;
grant execute on function public.vin_brand(text) to authenticated;

do $migration$
declare
  v_def text := pg_get_functiondef('public.update_vehicle_deadlines(uuid,jsonb)'::regprocedure);
  v_new text := v_def;
  v_steps text[][] := array[
    [$a$    if v_key not in ('ct_due_date', 'tailgate_due_date', 'antipollution_due_date', 'vin') then$a$,
     $b$    if v_key not in ('ct_due_date', 'tailgate_due_date', 'antipollution_due_date', 'vin', 'brand', 'model') then$b$],
    [$a$    vin               = case when p_patch ? 'vin' then v_vin else vin end$a$,
     $b$    vin               = case when p_patch ? 'vin' then v_vin else vin end,
    -- Marque et modèle : seulement sur une fiche qui n'en a pas (lus sur le document, sinon marque du VIN)
    brand             = coalesce(nullif(btrim(brand), ''),
                                 left(nullif(btrim(p_patch ->> 'brand'), ''), 60),
                                 public.vin_brand(case when p_patch ? 'vin' then v_vin else vin end)),
    model             = coalesce(nullif(btrim(model), ''), left(nullif(btrim(p_patch ->> 'model'), ''), 60))$b$]
  ];
  v_step text[];
begin
  foreach v_step slice 1 in array v_steps loop
    if position(v_step[1] in v_new) = 0 then
      raise exception 'Texte introuvable dans update_vehicle_deadlines : %', v_step[1];
    end if;
    v_new := replace(v_new, v_step[1], v_step[2]);
  end loop;
  execute v_new;
end;
$migration$;
