-- =============================================================================
-- Conformité anti-fraude TVA (art. 286, I, 3° bis du CGI ; BOI-TVA-DECLA-30-10-30)
--
-- RTS encaisse des particuliers : le logiciel a une fonction de caisse et doit garantir
-- l'inaltérabilité, la sécurisation, la conservation et l'archivage des données.
--
--   1. Paiements inaltérables : plus de modification ni de suppression. Une erreur se corrige
--      par une écriture d'annulation (montant négatif liée au paiement d'origine, § 90).
--   2. Journal fiscal chaîné (§ 100 et 140) : chaque facture émise, avoir, paiement et archive
--      y entre avec son contenu figé et une empreinte SHA-256 qui inclut l'empreinte précédente.
--      Toute modification d'une écriture ou d'un document déjà journalisé se voit à la vérification.
--   3. Archives fiscales figées (§ 220 à 250) : une par mois au moins (automatique le 1er du mois),
--      au format JSON, avec leur empreinte, en lecture seule et téléchargeables avec leur notice.
--
-- Conservation (§ 155) : factures, avoirs, paiements, journal et archives ne sont jamais purgés.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Paiements : annulation par écriture inverse
-- ---------------------------------------------------------------------------

alter table public.payments
  add column reverses_payment_id uuid unique references public.payments (id) on delete restrict,
  add column cancel_reason text check (char_length(cancel_reason) <= 500);
comment on column public.payments.reverses_payment_id is
  'Écriture d''annulation : paiement annulé (montant négatif égal à son opposé).';
comment on column public.payments.cancel_reason is 'Motif facultatif de l''annulation.';

alter table public.payments drop constraint payments_amount_ttc_check;
alter table public.payments add constraint payments_amount_sign_check check (
  (reverses_payment_id is null and amount_ttc > 0) or (reverses_payment_id is not null and amount_ttc < 0)
);

-- Une annulation ne passe que par cancel_payment
create or replace function public.payments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.invoices where id = new.invoice_id and status = 'issued') then
    raise exception 'Un paiement se rattache à une facture émise' using errcode = 'P0001';
  end if;
  if (new.reverses_payment_id is not null or new.cancel_reason is not null)
     and coalesce(current_setting('rts.payment_cancel', true), '') <> 'on'
     and not public.is_migration_context() then
    raise exception 'L''annulation d''un paiement passe par cancel_payment' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Le plafond du reste dû ne concerne que les encaissements
create or replace function public.payments_not_above_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  if public.is_migration_context() or new.amount_ttc < 0 then
    return new;
  end if;
  select balance_due into v_balance from public.v_invoice_balances where invoice_id = new.invoice_id;
  if new.amount_ttc > coalesce(v_balance, 0) + 0.01 then
    raise exception 'Le paiement dépasse le reste dû (% €)', to_char(coalesce(v_balance, 0), 'FM999999990.00')
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Plus de modification ni de suppression d'un paiement
create or replace function public.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_migration_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'Un paiement enregistré ne peut être ni modifié ni supprimé : annule-le' using errcode = '42501';
end;
$$;

create trigger payments_guard
  before update or delete on public.payments
  for each row execute function public.payments_guard();

drop policy payments_delete on public.payments;

-- Historique des règlements : l'annulation y entre comme telle
alter table public.payment_events drop constraint payment_events_kind_check;
alter table public.payment_events add constraint payment_events_kind_check
  check (kind in ('recorded', 'deleted', 'cancelled'));

create or replace function public.payments_log_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (invoice_id, payment_id, kind, amount_ttc, method, paid_on, note, reason,
                                     actor_id, happened_at)
  values (new.invoice_id, coalesce(new.reverses_payment_id, new.id),
          case when new.reverses_payment_id is null then 'recorded' else 'cancelled' end,
          abs(new.amount_ttc), new.method, new.paid_on, new.note, new.cancel_reason, new.recorded_by,
          new.created_at);
  return null;
end;
$$;

-- Annuler un paiement (direction) : écriture inverse datée du jour, le paiement d'origine reste.
create or replace function public.cancel_payment(p_payment_id uuid, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_direction();
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable' using errcode = 'P0002';
  end if;
  if v_payment.reverses_payment_id is not null then
    raise exception 'Une annulation ne s''annule pas : enregistre à nouveau le paiement' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payments where reverses_payment_id = p_payment_id) then
    raise exception 'Ce paiement est déjà annulé' using errcode = 'P0001';
  end if;

  perform set_config('rts.payment_cancel', 'on', true);
  insert into public.payments (invoice_id, amount_ttc, method, paid_on, note, recorded_by, reverses_payment_id,
                               cancel_reason)
  values (v_payment.invoice_id, -v_payment.amount_ttc, v_payment.method, public.paris_date(now()),
          'Annulation du paiement du ' || to_char(v_payment.paid_on, 'DD/MM/YYYY'), auth.uid(), p_payment_id,
          v_reason)
  returning id into v_id;
  perform set_config('rts.payment_cancel', '', true);
  return v_id;
end;
$$;
revoke execute on function public.cancel_payment(uuid, text) from public, anon;
grant execute on function public.cancel_payment(uuid, text) to authenticated;

-- Ancien nom gardé le temps du déploiement de l'appli : annule au lieu de supprimer.
create or replace function public.delete_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cancel_payment(p_payment_id, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Journal fiscal chaîné
-- ---------------------------------------------------------------------------

-- Horodatage en UTC, au même format quel que soit le fuseau de la session (empreintes stables)
create or replace function public.fiscal_ts(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
$$;

-- Contenu figé d'une facture émise : en-tête, mentions client, totaux et lignes
create or replace function public.fiscal_invoice_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', i.number,
    'emise_le', public.fiscal_ts(i.issued_at),
    'date_prestation', i.service_date,
    'client_id', i.client_id,
    'client', i.client_name,
    'adresse', i.client_address,
    'siret', i.client_siret,
    'tva_intracom', i.client_vat_number,
    'vehicule', i.vehicle_label,
    'kilometrage', i.mileage,
    'regime_tva', i.vat_scheme,
    'exoneration_tva', i.vat_exempt,
    'mention_exoneration', i.vat_exempt_mention,
    'reprise_ancienne_appli', i.is_legacy_import,
    'total_ht', i.total_ht,
    'total_tva', i.total_vat,
    'total_ttc', i.total_ttc,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', l.line_type, 'designation', l.description, 'quantite', l.quantity,
               'prix_unitaire_ht', l.unit_price, 'remise_pct', l.discount_percent, 'taux_tva', l.vat_rate,
               'net_ht', l.net_ht)
             order by l.position, l.id)
      from public.invoice_lines l where l.invoice_id = i.id), '[]'::jsonb))
  from public.invoices i
  where i.id = p_id and i.status = 'issued';
$$;

create or replace function public.fiscal_credit_note_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'numero', c.number,
    'emis_le', public.fiscal_ts(c.issued_at),
    'facture_id', c.invoice_id,
    'facture', i.number,
    'motif', c.reason,
    'montant_ht', c.amount_ht,
    'taux_tva', c.vat_rate,
    'total_tva', c.total_vat,
    'total_ttc', c.total_ttc)
  from public.credit_notes c
  join public.invoices i on i.id = c.invoice_id
  where c.id = p_id;
$$;

create or replace function public.fiscal_payment_snapshot(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'facture_id', p.invoice_id,
    'facture', i.number,
    'montant_ttc', p.amount_ttc,
    'mode', p.method,
    'date', p.paid_on,
    'note', p.note,
    'annule_paiement_id', p.reverses_payment_id,
    'motif_annulation', p.cancel_reason,
    'saisi_le', public.fiscal_ts(p.created_at))
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  where p.id = p_id;
$$;

create table public.fiscal_journal (
  seq            bigint primary key,
  event_type     text not null check (event_type in ('invoice', 'credit_note', 'payment', 'archive')),
  document_id    uuid not null,
  document_number text,
  amount_ttc     numeric(12,2),
  occurred_at    timestamptz not null,
  -- Sans clé étrangère : une écriture ne change jamais, même si le compte est supprimé
  actor_id       uuid,
  payload        jsonb not null,
  prev_hash      text not null,
  hash           text not null unique,
  recorded_at    timestamptz not null default now()
);
create index fiscal_journal_document_idx on public.fiscal_journal (event_type, document_id);
create index fiscal_journal_occurred_idx on public.fiscal_journal (occurred_at);
comment on table public.fiscal_journal is
  'Journal fiscal inaltérable : factures émises, avoirs, paiements et archives, chaînés par SHA-256.';

-- Empreinte d'une écriture : toutes ses colonnes, précédente comprise, séparées par « | »
-- (précédente | numéro d'ordre | type | document | numéro | montant TTC | date UTC | auteur | contenu)
create or replace function public.fiscal_hash(p_entry public.fiscal_journal)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(
    p_entry.prev_hash || '|' || p_entry.seq::text || '|' || p_entry.event_type || '|' || p_entry.document_id::text
      || '|' || coalesce(p_entry.document_number, '') || '|' || coalesce(p_entry.amount_ttc::text, '')
      || '|' || public.fiscal_ts(p_entry.occurred_at) || '|' || coalesce(p_entry.actor_id::text, '')
      || '|' || p_entry.payload::text,
    'sha256'), 'hex');
$$;

-- Numéro d'ordre continu, chaînage et empreinte calculés ici, jamais fournis par l'appelant
create or replace function public.fiscal_journal_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last public.fiscal_journal;
begin
  perform pg_advisory_xact_lock(hashtext('rts.fiscal_journal'));
  select * into v_last from public.fiscal_journal order by seq desc limit 1;
  new.seq := coalesce(v_last.seq, 0) + 1;
  new.prev_hash := coalesce(v_last.hash, repeat('0', 64));
  new.recorded_at := now();
  new.hash := public.fiscal_hash(new);
  return new;
end;
$$;

create trigger fiscal_journal_before_insert
  before insert on public.fiscal_journal
  for each row execute function public.fiscal_journal_before_insert();

-- Aucune exception, même en migration : le journal ne se modifie ni ne se vide
create or replace function public.fiscal_journal_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le journal fiscal est inaltérable' using errcode = '42501';
end;
$$;

create trigger fiscal_journal_guard
  before update or delete on public.fiscal_journal
  for each row execute function public.fiscal_journal_guard();
create trigger fiscal_journal_no_truncate
  before truncate on public.fiscal_journal
  for each statement execute function public.fiscal_journal_guard();

alter table public.fiscal_journal enable row level security;
revoke all on public.fiscal_journal from public, anon, authenticated;
grant select on public.fiscal_journal to authenticated;
create policy fiscal_journal_select on public.fiscal_journal for select to authenticated
  using ((select public.can_read_accounting()));

-- Contenu figé d'un document du journal, tel qu'il est aujourd'hui en base
create or replace function public.fiscal_document_snapshot(p_type text, p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case p_type
    when 'invoice' then public.fiscal_invoice_snapshot(p_id)
    when 'credit_note' then public.fiscal_credit_note_snapshot(p_id)
    when 'payment' then public.fiscal_payment_snapshot(p_id)
  end;
$$;

create or replace function public.fiscal_journal_append(p_type text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := public.fiscal_document_snapshot(p_type, p_id);
begin
  if v_payload is null then
    raise exception 'Document % introuvable pour le journal fiscal', p_id using errcode = 'P0002';
  end if;
  insert into public.fiscal_journal (event_type, document_id, document_number, amount_ttc, occurred_at,
                                     actor_id, payload, prev_hash, hash)
  select p_type, p_id, d.number, d.amount, d.at, d.actor, v_payload, '', ''
  from (
    select i.number, i.total_ttc as amount, i.issued_at as at, i.issued_by as actor
      from public.invoices i where p_type = 'invoice' and i.id = p_id
    union all
    select c.number, c.total_ttc, c.issued_at, c.created_by
      from public.credit_notes c where p_type = 'credit_note' and c.id = p_id
    union all
    select i.number, p.amount_ttc, p.created_at, p.recorded_by
      from public.payments p join public.invoices i on i.id = p.invoice_id
     where p_type = 'payment' and p.id = p_id
  ) d;
end;
$$;

create or replace function public.invoices_fiscal_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fiscal_journal_append('invoice', new.id);
  return null;
end;
$$;

-- Émission (brouillon → émise) ou facture reprise insérée déjà émise
create trigger invoices_fiscal_journal_issue
  after update of status on public.invoices
  for each row when (old.status is distinct from 'issued' and new.status = 'issued')
  execute function public.invoices_fiscal_journal();
-- Facture reprise : journalisée à la fin de la transaction, une fois ses lignes insérées
create constraint trigger invoices_fiscal_journal_import
  after insert on public.invoices
  deferrable initially deferred
  for each row when (new.status = 'issued')
  execute function public.invoices_fiscal_journal();

create or replace function public.credit_notes_fiscal_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fiscal_journal_append('credit_note', new.id);
  return null;
end;
$$;

create trigger credit_notes_fiscal_journal
  after insert on public.credit_notes
  for each row execute function public.credit_notes_fiscal_journal();

create or replace function public.payments_fiscal_journal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fiscal_journal_append('payment', new.id);
  return null;
end;
$$;

create trigger payments_fiscal_journal
  after insert on public.payments
  for each row execute function public.payments_fiscal_journal();

-- Reprise de l'existant, dans l'ordre chronologique (les paiements supprimés avant ce journal
-- restent seulement dans l'historique des règlements)
do $$
declare
  v_doc record;
begin
  for v_doc in
    select 'invoice' as kind, id, issued_at as at, 0 as rank from public.invoices where status = 'issued'
    union all
    select 'credit_note', id, issued_at, 1 from public.credit_notes
    union all
    select 'payment', id, created_at, 2 from public.payments
    order by at, rank, id
  loop
    perform public.fiscal_journal_append(v_doc.kind, v_doc.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Vérification de l'intégrité
-- ---------------------------------------------------------------------------

-- Recalcule toute la chaîne et compare chaque document à son contenu journalisé.
create or replace function public.verify_fiscal_journal()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row public.fiscal_journal;
  v_prev text := repeat('0', 64);
  v_expected bigint := 1;
  v_errors jsonb := '[]'::jsonb;
  v_count bigint := 0;
  v_current jsonb;
  v_missing record;
begin
  if not public.can_read_accounting() and auth.uid() is not null then
    raise exception 'Accès refusé : réservé à la direction et au comptable' using errcode = '42501';
  end if;

  for v_row in select * from public.fiscal_journal order by seq loop
    v_count := v_count + 1;
    if v_row.seq <> v_expected then
      v_errors := v_errors || jsonb_build_object('seq', v_row.seq, 'probleme', 'Écriture manquante avant celle-ci');
    end if;
    if v_row.prev_hash <> v_prev then
      v_errors := v_errors || jsonb_build_object('seq', v_row.seq, 'probleme', 'Chaînage rompu');
    end if;
    if v_row.hash <> public.fiscal_hash(v_row) then
      v_errors := v_errors || jsonb_build_object('seq', v_row.seq, 'probleme', 'Écriture modifiée');
    end if;
    if v_row.event_type = 'archive' then
      if not exists (select 1 from public.fiscal_archives a
                      where a.id = v_row.document_id and a.sha256 = v_row.payload ->> 'sha256'
                        and a.sha256 = encode(extensions.digest(a.content::text, 'sha256'), 'hex')) then
        v_errors := v_errors || jsonb_build_object('seq', v_row.seq, 'probleme', 'Archive modifiée ou supprimée',
                                                   'document', v_row.document_number);
      end if;
    else
      v_current := public.fiscal_document_snapshot(v_row.event_type, v_row.document_id);
      if v_current is null then
        v_errors := v_errors || jsonb_build_object('seq', v_row.seq, 'probleme', 'Document supprimé',
                                                   'document', v_row.document_number);
      elsif v_current is distinct from v_row.payload then
        v_errors := v_errors || jsonb_build_object('seq', v_row.seq, 'probleme', 'Document modifié',
                                                   'document', v_row.document_number);
      end if;
    end if;
    v_prev := v_row.hash;
    v_expected := v_row.seq + 1;
  end loop;

  -- Documents passés à côté du journal (déclencheurs désactivés)
  for v_missing in
    select 'invoice' as kind, i.id, i.number from public.invoices i where i.status = 'issued'
       and not exists (select 1 from public.fiscal_journal j where j.event_type = 'invoice' and j.document_id = i.id)
    union all
    select 'credit_note', c.id, c.number from public.credit_notes c
     where not exists (select 1 from public.fiscal_journal j where j.event_type = 'credit_note' and j.document_id = c.id)
    union all
    select 'payment', p.id, null from public.payments p
     where not exists (select 1 from public.fiscal_journal j where j.event_type = 'payment' and j.document_id = p.id)
  loop
    v_errors := v_errors || jsonb_build_object('seq', null, 'probleme', 'Document absent du journal',
                                               'document', coalesce(v_missing.number, v_missing.id::text));
  end loop;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_errors) = 0,
    'ecritures', v_count,
    'derniere_empreinte', v_prev,
    'verifie_le', public.fiscal_ts(now()),
    'erreurs', (select coalesce(jsonb_agg(e), '[]'::jsonb) from (
                  select e from jsonb_array_elements(v_errors) e limit 50) x));
end;
$$;
revoke execute on function public.verify_fiscal_journal() from public, anon;
grant execute on function public.verify_fiscal_journal() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Archives fiscales figées
-- ---------------------------------------------------------------------------

create table public.fiscal_archives (
  id            uuid primary key default gen_random_uuid(),
  period_from   date not null,
  period_to     date not null,
  entries_count integer not null,
  first_seq     bigint,
  last_seq      bigint,
  content       jsonb not null,
  sha256        text not null,
  automatic     boolean not null default false,
  created_by    uuid,   -- sans clé étrangère : l'archive ne change jamais
  created_at    timestamptz not null default now(),
  constraint fiscal_archives_period_check check (period_to >= period_from),
  constraint fiscal_archives_period_key unique (period_from, period_to)
);
comment on table public.fiscal_archives is
  'Archives fiscales figées (JSON) : écritures du journal d''une période, totaux et chaînage, avec leur SHA-256.';

create trigger fiscal_archives_guard
  before update or delete on public.fiscal_archives
  for each row execute function public.fiscal_journal_guard();
create trigger fiscal_archives_no_truncate
  before truncate on public.fiscal_archives
  for each statement execute function public.fiscal_journal_guard();

alter table public.fiscal_archives enable row level security;
revoke all on public.fiscal_archives from public, anon, authenticated;
grant select (id, period_from, period_to, entries_count, first_seq, last_seq, sha256, automatic, created_by,
              created_at) on public.fiscal_archives to authenticated;
create policy fiscal_archives_select on public.fiscal_archives for select to authenticated
  using ((select public.can_read_accounting()));

-- Construit, enregistre et journalise l'archive d'une période close (sans contrôle de rôle)
create or replace function public.fiscal_archive_build(p_from date, p_to date, p_automatic boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_entries jsonb;
  v_first public.fiscal_journal;
  v_last public.fiscal_journal;
  v_count integer;
  v_content jsonb;
  v_sha text;
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Période invalide' using errcode = '22023';
  end if;
  if p_to >= public.paris_date(now()) then
    raise exception 'On archive une période close : elle doit finir avant aujourd''hui' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fiscal_archives where period_from = p_from and period_to = p_to) then
    raise exception 'Cette période est déjà archivée' using errcode = '23505';
  end if;

  select count(*)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'seq', j.seq, 'type', j.event_type, 'document_id', j.document_id, 'numero', j.document_number,
           'montant_ttc', j.amount_ttc, 'date', public.fiscal_ts(j.occurred_at), 'auteur_id', j.actor_id,
           'contenu', j.payload, 'empreinte_precedente', j.prev_hash, 'empreinte', j.hash)
           order by j.seq), '[]'::jsonb)
    into v_count, v_entries
  from public.fiscal_journal j
  where j.event_type <> 'archive' and public.paris_date(j.occurred_at) between p_from and p_to;

  select * into v_first from public.fiscal_journal j
   where j.event_type <> 'archive' and public.paris_date(j.occurred_at) between p_from and p_to
   order by j.seq limit 1;
  select * into v_last from public.fiscal_journal j
   where j.event_type <> 'archive' and public.paris_date(j.occurred_at) between p_from and p_to
   order by j.seq desc limit 1;

  v_content := jsonb_build_object(
    'format', 'rts-archive-fiscale/1',
    'logiciel', 'RTS Atelier',
    'editeur', 'KYNES. (Rayan OUGHLIS, EI, SIREN 107 222 333)',
    'entreprise', (select jsonb_build_object('raison_sociale', c.legal_name, 'siret', c.siret,
                                             'tva_intracom', c.vat_number)
                     from public.company_settings c limit 1),
    'periode', jsonb_build_object('du', p_from, 'au', p_to),
    'archive_id', v_id,
    'generee_le', public.fiscal_ts(now()),
    'automatique', p_automatic,
    'chainage', jsonb_build_object(
      'premiere_ecriture', v_first.seq, 'derniere_ecriture', v_last.seq,
      'empreinte_avant_periode', v_first.prev_hash, 'derniere_empreinte', v_last.hash),
    'totaux_periode', jsonb_build_object(
      'factures_ttc', coalesce((select sum(j.amount_ttc) from public.fiscal_journal j
                                 where j.event_type = 'invoice'
                                   and public.paris_date(j.occurred_at) between p_from and p_to), 0),
      'avoirs_ttc', coalesce((select sum(j.amount_ttc) from public.fiscal_journal j
                               where j.event_type = 'credit_note'
                                 and public.paris_date(j.occurred_at) between p_from and p_to), 0),
      'encaissements_ttc', coalesce((select sum(j.amount_ttc) from public.fiscal_journal j
                                      where j.event_type = 'payment'
                                        and public.paris_date(j.occurred_at) between p_from and p_to), 0),
      'encaissements_par_mode', coalesce((
        select jsonb_object_agg(m.mode, m.total) from (
          select j.payload ->> 'mode' as mode, sum(j.amount_ttc) as total
          from public.fiscal_journal j
          where j.event_type = 'payment' and public.paris_date(j.occurred_at) between p_from and p_to
          group by 1) m), '{}'::jsonb)),
    -- Total perpétuel : chiffre d'affaires TTC (factures moins avoirs) depuis la mise en service
    'total_perpetuel_ttc', coalesce((select sum(case j.event_type when 'invoice' then j.amount_ttc
                                                                  else -j.amount_ttc end)
                                       from public.fiscal_journal j
                                      where j.event_type in ('invoice', 'credit_note')
                                        and public.paris_date(j.occurred_at) <= p_to), 0),
    'ecritures', v_entries);
  v_sha := encode(extensions.digest(v_content::text, 'sha256'), 'hex');

  insert into public.fiscal_archives (id, period_from, period_to, entries_count, first_seq, last_seq, content,
                                      sha256, automatic, created_by)
  values (v_id, p_from, p_to, v_count, v_first.seq, v_last.seq, v_content, v_sha, p_automatic, auth.uid());

  insert into public.fiscal_journal (event_type, document_id, document_number, occurred_at, actor_id, payload,
                                     prev_hash, hash)
  values ('archive', v_id, to_char(p_from, 'DD/MM/YYYY') || ' au ' || to_char(p_to, 'DD/MM/YYYY'), now(),
          auth.uid(),
          jsonb_build_object('du', p_from, 'au', p_to, 'ecritures', v_count, 'sha256', v_sha), '', '');
  return v_id;
end;
$$;
revoke execute on function public.fiscal_archive_build(date, date, boolean) from public, anon, authenticated;

-- Archive à la demande (direction ou comptable), par exemple l'exercice entier
create or replace function public.create_fiscal_archive(p_from date, p_to date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_read_accounting() then
    raise exception 'Accès refusé : réservé à la direction et au comptable' using errcode = '42501';
  end if;
  return public.fiscal_archive_build(p_from, p_to, false);
end;
$$;
revoke execute on function public.create_fiscal_archive(date, date) from public, anon;
grant execute on function public.create_fiscal_archive(date, date) to authenticated;

-- Archive automatique du mois précédent (tâche planifiée du 1er du mois)
create or replace function public.archive_previous_month()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from date := (date_trunc('month', public.paris_date(now())) - interval '1 month')::date;
  v_to date := (date_trunc('month', public.paris_date(now())) - interval '1 day')::date;
begin
  if exists (select 1 from public.fiscal_archives where period_from = v_from and period_to = v_to) then
    return null;
  end if;
  return public.fiscal_archive_build(v_from, v_to, true);
end;
$$;
revoke execute on function public.archive_previous_month() from public, anon, authenticated;

-- Contenu exact de l'archive (texte dont le SHA-256 est l'empreinte enregistrée)
create or replace function public.fiscal_archive_content(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_content text;
begin
  if not public.can_read_accounting() then
    raise exception 'Accès refusé : réservé à la direction et au comptable' using errcode = '42501';
  end if;
  select content::text into v_content from public.fiscal_archives where id = p_id;
  if v_content is null then
    raise exception 'Archive introuvable' using errcode = 'P0002';
  end if;
  return v_content;
end;
$$;
revoke execute on function public.fiscal_archive_content(uuid) from public, anon;
grant execute on function public.fiscal_archive_content(uuid) to authenticated;

-- Le 1er du mois à 3 h UTC (4 h ou 5 h à Paris) : le mois précédent est clos partout
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rts-fiscal-archive', '0 3 1 * *', 'select public.archive_previous_month()');
  else
    raise notice 'pg_cron indisponible : archive fiscale mensuelle non planifiée';
  end if;
end;
$$;

revoke execute on function public.fiscal_ts(timestamptz), public.fiscal_invoice_snapshot(uuid),
  public.fiscal_credit_note_snapshot(uuid), public.fiscal_payment_snapshot(uuid),
  public.fiscal_hash(public.fiscal_journal), public.fiscal_document_snapshot(text, uuid),
  public.fiscal_journal_append(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.payments_guard(), public.fiscal_journal_before_insert(),
  public.fiscal_journal_guard(), public.invoices_fiscal_journal(), public.credit_notes_fiscal_journal(),
  public.payments_fiscal_journal()
  from public, anon, authenticated;
