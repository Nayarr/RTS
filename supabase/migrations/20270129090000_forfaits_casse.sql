-- =============================================================================
-- RTS Atelier : noms des forfaits en minuscules, majuscule au début
--
-- - Les forfaits repris de l'ancien logiciel sont écrits tout en majuscules (« FORFAIT VIDANGE PL »).
--   Ils deviennent « Forfait vidange PL » : majuscule à la première lettre, le reste en minuscules,
--   sauf les sigles (PL, AR, CT, HP…), les marques (Volvo, AdBlue…) et les mots avec des chiffres
--   (références « 002103 », « X2 », « 19T »).
-- - Seuls les noms écrits entièrement en majuscules changent : un nom déjà écrit en minuscules
--   reste tel quel. Un forfait saisi en majuscules (nouveau ou modifié) suit la même règle.
-- - Les lignes déjà copiées sur les devis, les factures et les avoirs restent telles quelles.
--   Seules les tâches prévues des OR pas encore facturés reprennent le nouveau nom (pour que la fiche
--   de contrôle reconnaisse toujours ses forfaits).
-- - Les forfaits des pneus sont reconnus sans tenir compte des majuscules (anciens et nouveaux libellés).
-- =============================================================================

-- Nom écrit en majuscules → « Forfait vidange PL »
create function public.package_name_case(p_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Sigles gardés en majuscules
  v_acronyms constant text[] := array[
    'PL', 'VL', 'VUL', 'PTAC', 'PTRA', 'AR', 'AV', 'ARG', 'ARD', 'AVG', 'AVD', 'CT', 'HP', 'BP', 'BV',
    'ABS', 'EBS', 'ESP', 'ASR', 'ADR', 'FAP', 'EGR', 'SCR', 'DPF', 'TPMS', 'LED', 'GPS', 'OBD', 'ECU',
    'VIN', 'GNV', 'GNL', 'GPL', 'HS', 'HT', 'TTC', 'TVA', 'MAN', 'DAF', 'RVI', 'BPW', 'SAF', 'ZF', 'TP',
    'PV', 'VGP'];
  -- Marques et noms propres : leur écriture d'usage
  v_names constant jsonb := '{
    "ADBLUE": "AdBlue", "VOLVO": "Volvo", "SCANIA": "Scania", "RENAULT": "Renault",
    "MERCEDES": "Mercedes", "IVECO": "Iveco", "KRONE": "Krone", "SCHMITZ": "Schmitz",
    "WABCO": "Wabco", "KNORR": "Knorr", "HALDEX": "Haldex", "MICHELIN": "Michelin",
    "BRIDGESTONE": "Bridgestone", "CONTINENTAL": "Continental", "GOODYEAR": "Goodyear",
    "WEBASTO": "Webasto", "EBERSPACHER": "Eberspächer", "EBERSPÄCHER": "Eberspächer",
    "DHOLLANDIA": "Dhollandia", "ZEPRO": "Zepro", "PALFINGER": "Palfinger", "CARRIER": "Carrier",
    "THERMO": "Thermo", "KING": "King", "FORD": "Ford", "FIAT": "Fiat", "CITROEN": "Citroën",
    "CITROËN": "Citroën", "PEUGEOT": "Peugeot", "TOYOTA": "Toyota", "NISSAN": "Nissan",
    "ISUZU": "Isuzu", "MITSUBISHI": "Mitsubishi", "VOLKSWAGEN": "Volkswagen"
  }'::jsonb;
  v_out text := '';
  v_token text;
  v_first boolean := true;
begin
  -- Déjà en minuscules (ou sans lettre) : inchangé
  if p_name is null or p_name <> upper(p_name) or p_name !~ '[[:alpha:]]' then
    return p_name;
  end if;
  for v_token in select m[1] from regexp_matches(p_name, '([[:alnum:]]+|[^[:alnum:]]+)', 'g') as m loop
    if v_token ~ '^[[:alnum:]]+$' then
      if v_names ? v_token then
        v_token := v_names ->> v_token;
      elsif not (v_token = any (v_acronyms) or v_token ~ '[0-9]') then
        v_token := case when v_first then upper(left(v_token, 1)) || lower(substr(v_token, 2))
                        else lower(v_token) end;
      end if;
      v_first := false;
    end if;
    v_out := v_out || v_token;
  end loop;
  return v_out;
end;
$$;

comment on function public.package_name_case(text) is
  'Nom de forfait écrit en majuscules → majuscule au début, le reste en minuscules (sigles, marques et références gardés).';

-- Appelée par le déclencheur des forfaits, avec les droits de la personne qui enregistre
revoke execute on function public.package_name_case(text) from public, anon;
grant execute on function public.package_name_case(text) to authenticated;

-- Forfait saisi en majuscules : même écriture que les autres
create function public.service_packages_name_case()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := public.package_name_case(new.name);
  return new;
end;
$$;

revoke execute on function public.service_packages_name_case() from public, anon, authenticated;

create trigger name_case before insert or update of name on public.service_packages
  for each row execute function public.service_packages_name_case();

-- Forfaits des pneus reconnus sans tenir compte des majuscules (« DÉPOSE/REPOSE ROUE X4 (arrière) »
-- des anciens devis comme « Dépose/repose roue (arrière) »)
do $migration$
declare
  v_def text := pg_get_functiondef('public.tyre_package_kind(text)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'select case substring(trim(split_part(coalesce(p_description, ''''), E''\n'', 1))',
    'select case upper(substring(trim(split_part(coalesce(p_description, ''''), E''\n'', 1))');
  v_new := replace(v_new,
    'from ''^(DÉPOSE/REPOSE PNEUMATIQUE|DÉPOSE/REPOSE ROUE|RECYCLAGE PNEUMATIQUE|ÉQUILIBRAGE)(?: X[24])?(?: \([^)]+\))?$'')',
    'from ''(?i)^(DÉPOSE/REPOSE PNEUMATIQUE|DÉPOSE/REPOSE ROUE|RECYCLAGE PNEUMATIQUE|ÉQUILIBRAGE)(?: X[24])?(?: \([^)]+\))?$''))');
  if v_new = v_def or v_new !~ 'case upper\(substring' or v_new !~ '\(\?i\)\^' then
    raise exception 'tyre_package_kind : texte attendu introuvable, migration à revoir';
  end if;
  execute v_new;
end;
$migration$;

-- Noms en majuscules renommés ; tâches prévues des OR pas encore facturés mises au nouveau nom.
-- Les lignes des devis, factures, avoirs et OR facturés ne changent pas.
create function public.package_names_to_case()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform set_config('rts.system', 'on', true);

  with renamed as (
    select id, name as old_name, public.package_name_case(name) as new_name
    from public.service_packages
    where public.package_name_case(name) <> name
  ),
  lines as (
    select l.id, r.old_name, r.new_name,
           substring(l.description from 'essieu ([0-9]+)')::integer as axle
    from public.ro_lines l
    join renamed r on r.id = l.package_id
    join public.repair_orders o on o.id = l.repair_order_id
    where o.status <> 'invoiced'
      and l.kind = 'planned'
      and l.line_type = 'package'
  ),
  planned as (
    update public.ro_lines l
       set description = case
             when left(l.description, length(x.old_name)) = x.old_name
               then x.new_name || substr(l.description, length(x.old_name) + 1)
             -- Forfait d'un essieu de remorque (« FORFAIT DISQUES essieu 2 »)
             else public.trailer_axle_label(x.new_name, x.axle)
                  || substr(l.description, length(public.trailer_axle_label(x.old_name, x.axle)) + 1)
           end
      from lines x
     where l.id = x.id
       and (left(l.description, length(x.old_name)) = x.old_name
            or (x.axle is not null
                and left(l.description, length(public.trailer_axle_label(x.old_name, x.axle)))
                    = public.trailer_axle_label(x.old_name, x.axle)))
    returning l.id
  ),
  packages as (
    update public.service_packages p
       set name = r.new_name
      from renamed r
     where p.id = r.id
    returning p.id
  )
  select count(*) into v_count from packages;

  perform set_config('rts.system', '', true);
  return v_count;
end;
$$;

comment on function public.package_names_to_case() is
  'Reprise : noms de forfaits en majuscules → écriture d''usage ; tâches prévues des OR ouverts mises au nouveau nom.';
revoke execute on function public.package_names_to_case() from public, anon, authenticated;

select public.package_names_to_case();
