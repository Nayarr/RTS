-- Client étranger : une entreprise hors de France n'a pas de SIRET.
-- - Fiche client : pays (code ISO à deux lettres, France par défaut) et n° d'entreprise du pays,
--   en texte libre (pas de contrôle des 14 chiffres). Un client étranger n'a jamais de SIRET.
-- - Facture émise : pays et n° d'entreprise figés avec le reste des coordonnées du client.

alter table public.clients
  add column country text not null default 'FR',
  add column foreign_id text,
  add constraint clients_country_check check (country ~ '^[A-Z]{2}$'),
  add constraint clients_foreign_id_check check (
    foreign_id is null or (country <> 'FR' and length(btrim(foreign_id)) between 2 and 40)
  ),
  add constraint clients_foreign_siret_check check (country = 'FR' or siret is null);

comment on column public.clients.country is
  'Pays du client (code ISO 3166 à deux lettres) ; hors de France : pas de SIRET.';
comment on column public.clients.foreign_id is
  'N° d''entreprise d''un client étranger (registre de son pays), tel que saisi.';

-- Fiche client (vue des clients) : pays et n° d'entreprise visibles et modifiables
do $migration$
declare
  v_def text := pg_get_viewdef('public.v_clients_overview'::regclass);
  v_new text := regexp_replace(v_def, E'\n   FROM (\\(*clients c)',
                               E',\n    c.country,\n    c.foreign_id\n   FROM \\1');
begin
  if v_new = v_def then
    raise exception 'v_clients_overview : clause FROM introuvable';
  end if;
  execute 'create or replace view public.v_clients_overview with (security_invoker = on) as ' || v_new;
end;
$migration$;

alter table public.invoices
  add column client_country text,
  add column client_foreign_id text;

comment on column public.invoices.client_country is 'Pays du client figé à l''émission.';
comment on column public.invoices.client_foreign_id is
  'N° d''entreprise du client étranger figé à l''émission.';

-- Facture (vue des factures) : pays et n° d'entreprise figés, imprimés sur le PDF
do $migration$
declare
  v_def text := pg_get_viewdef('public.v_invoices_overview'::regclass);
  v_new text := regexp_replace(v_def, E'\n   FROM (\\(*invoices i)',
                               E',\n    i.client_country,\n    i.client_foreign_id\n   FROM \\1');
begin
  if v_new = v_def then
    raise exception 'v_invoices_overview : clause FROM introuvable';
  end if;
  execute 'create or replace view public.v_invoices_overview with (security_invoker = on) as ' || v_new;
end;
$migration$;

-- Émission : pays et n° d'entreprise figés comme le SIRET
do $migration$
declare
  v_def text := pg_get_functiondef('public.issue_invoice'::regproc);
  v_old text := $old$    client_siret = v_client.siret,$old$;
  v_new text := $new$    client_siret = v_client.siret,
    client_country = v_client.country,
    client_foreign_id = v_client.foreign_id,$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans issue_invoice : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;
