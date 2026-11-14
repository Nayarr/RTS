-- Relance automatique des factures impayées, tous les lundis à 9 h (heure de Paris).
--   Factures émises, reste dû d'au moins 1 €, échéance dépassée selon le type de compte du client :
--     comptant : dès le lendemain de l'échéance ;
--     prélèvement le 5 ou le 15 : 5 jours après la date du prélèvement (prélèvement rejeté ou pas encaissé) ;
--     quinzaine, prélèvement sans jour : 3 jours après l'échéance.
--   Un e-mail par client (adresse facturation), toutes ses factures en retard avec leur lien.
--   Ton gradué : 1re relance cordiale, 2e ferme, 3e dernier rappel. Après 3 relances automatiques d'une
--   facture : plus d'envoi, la direction est prévenue (« à appeler »).
--   Pas de relance si une relance (manuelle ou automatique) est partie il y a moins de 6 jours.
--   « Ne pas relancer » sur la fiche client ou sur la facture (litige, accord de paiement).
--   Client sans e-mail : signalé à la direction. Résumé du lundi à la direction.
--   Désactivée par défaut (Réglages), avec l'envoi des e-mails par l'appli.

alter table public.app_settings
  add column overdue_reminders_enabled boolean not null default false,
  add column last_overdue_reminders_on date;
comment on column public.app_settings.overdue_reminders_enabled is
  'Relance automatique des factures impayées le lundi à 9 h (avec l''envoi des e-mails par l''appli).';
comment on column public.app_settings.last_overdue_reminders_on is 'Dernier lundi où la relance automatique est partie.';

alter table public.clients add column no_auto_reminders boolean not null default false;
comment on column public.clients.no_auto_reminders is 'Client jamais relancé automatiquement (litige, accord de paiement).';

-- Fiche client (vue des clients) : réglage visible et modifiable
do $migration$
declare
  v_def text := pg_get_viewdef('public.v_clients_overview'::regclass);
  v_new text := regexp_replace(v_def, E'\n   FROM (\\(*clients c)', E',\n    c.no_auto_reminders\n   FROM \\1');
begin
  if v_new = v_def then
    raise exception 'v_clients_overview : clause FROM introuvable';
  end if;
  execute 'create or replace view public.v_clients_overview with (security_invoker = on) as ' || v_new;
end;
$migration$;
alter table public.invoices add column no_auto_reminders boolean not null default false;
comment on column public.invoices.no_auto_reminders is 'Facture jamais relancée automatiquement (litige, accord de paiement).';

alter table public.invoice_reminders
  add column auto_level smallint check (auto_level between 1 and 3);
comment on column public.invoice_reminders.auto_level is
  'Relance automatique : niveau (1 cordiale, 2 ferme, 3 dernier rappel) ; vide pour une relance manuelle.';

-- « Ne pas relancer » reste modifiable sur une facture émise (rien ne change pour le client)
do $migration$
declare
  v_def text := pg_get_functiondef('public.invoices_guard'::regproc);
  v_old text := $old$array['public_token', 'pdf_file_id', 'updated_at', 'sent_at']$old$;
  v_new text := $new$array['public_token', 'pdf_file_id', 'updated_at', 'sent_at', 'no_auto_reminders']$new$;
begin
  if position(v_old in v_def) = 0 then
    raise exception 'Texte introuvable dans invoices_guard : %', v_old;
  end if;
  execute replace(v_def, v_old, v_new);
end;
$migration$;

-- Délai après l'échéance avant relance, selon le type de compte
create function public.overdue_reminder_grace_days(p_account_type text, p_debit_day smallint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_account_type = 'comptant' then 0
    when p_account_type = 'prelevement' and p_debit_day is not null then 5
    else 3
  end;
$$;
revoke execute on function public.overdue_reminder_grace_days(text, smallint) from public, anon;
grant execute on function public.overdue_reminder_grace_days(text, smallint) to authenticated;

-- ---------------------------------------------------------------------------
-- Factures en retard à relancer (échéance + délai du type de compte dépassés)
-- ---------------------------------------------------------------------------
create function public.overdue_reminder_candidates(p_today date)
returns table (
  invoice_id uuid, number text, client_id uuid, client_name text, email text, vehicle_label text,
  issued_at timestamptz, due_date date, balance_due numeric, auto_count integer, last_sent timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.invoice_id, b.number, b.client_id, c.name, nullif(btrim(c.email), ''),
         b.vehicle_label, b.issued_at, b.due_date, b.balance_due,
         (select count(*) from public.invoice_reminders r
          where r.invoice_id = b.invoice_id and r.auto_level is not null)::integer,
         (select max(r.sent_at) from public.invoice_reminders r where r.invoice_id = b.invoice_id)
  from public.v_invoice_balances b
  join public.invoices i on i.id = b.invoice_id
  join public.clients c on c.id = b.client_id
  where i.status = 'issued'
    and b.balance_due >= 1
    and b.due_date is not null
    and b.due_date + public.overdue_reminder_grace_days(c.account_type, c.direct_debit_day) < p_today
    and not c.no_auto_reminders
    and not i.no_auto_reminders;
$$;
-- Lecture réservée aux fonctions de la relance (adresses e-mail des clients)
revoke execute on function public.overdue_reminder_candidates(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Factures à relancer aujourd'hui (fonction Edge « relances », compte de service)
-- ---------------------------------------------------------------------------
create function public.prepare_overdue_reminders(p_today date default public.paris_date(now()))
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- Déjà relancée 3 fois automatiquement : la direction appelle le client
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'overdue_call', 'À appeler : ' || o.client_name,
         'Facture ' || o.number || ' : 3 relances sans règlement, reste dû '
           || to_char(o.balance_due, 'FM999G999G990D00') || ' € TTC',
         '/factures/' || o.invoice_id, 'overdue-call-' || o.invoice_id
  from public.overdue_reminder_candidates(p_today) o
  where o.auto_count >= 3
  on conflict (dedupe_key) do nothing;

  -- Client sans e-mail : relance à faire à la main
  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select 'direction', 'overdue_no_email', 'Relance impossible : ' || min(o.client_name),
         'Pas d''e-mail sur la fiche client : ' || count(*) || ' facture(s) en retard, '
           || to_char(sum(o.balance_due), 'FM999G999G990D00') || ' € TTC',
         '/clients/' || o.client_id, 'overdue-no-email-' || o.client_id || '-' || p_today
  from public.overdue_reminder_candidates(p_today) o
  where o.email is null and o.auto_count < 3
    and (o.last_sent is null or o.last_sent < now() - interval '6 days')
  group by o.client_id
  on conflict (dedupe_key) do nothing;

  -- Lien public des factures envoyées (comme un envoi manuel)
  update public.invoices i
     set public_token = public.generate_public_token(), sent_at = coalesce(i.sent_at, now())
    from public.overdue_reminder_candidates(p_today) o
   where i.id = o.invoice_id and i.public_token is null and o.email is not null and o.auto_count < 3;

  select coalesce(jsonb_agg(x order by x ->> 'client_name'), '[]'::jsonb) into v_result
  from (
    select jsonb_build_object(
             'client_id', o.client_id,
             'client_name', min(o.client_name),
             'to', min(o.email),
             'level', least(3, max(o.auto_count) + 1),
             'balance', sum(o.balance_due),
             'invoices', jsonb_agg(jsonb_build_object(
               'invoice_id', o.invoice_id, 'number', o.number, 'issued_at', o.issued_at,
               'due_date', o.due_date, 'vehicle_label', o.vehicle_label, 'balance_due', o.balance_due,
               'token', i.public_token) order by o.due_date, o.number)) as x
    from public.overdue_reminder_candidates(p_today) o
    join public.invoices i on i.id = o.invoice_id
    where o.email is not null and o.auto_count < 3
      and (o.last_sent is null or o.last_sent < now() - interval '6 days')
    group by o.client_id
  ) t;
  return v_result;
end;
$$;
revoke execute on function public.prepare_overdue_reminders(date) from public, anon, authenticated;

-- Relance envoyée : notée sur chaque facture (historique, historique de l'OR)
create function public.record_overdue_reminder(p_invoice_ids uuid[], p_level smallint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.invoice_reminders (invoice_id, sent_by, auto_level)
  select unnest(p_invoice_ids), null, p_level;
  get diagnostics v_count = row_count;

  insert into public.ro_events (repair_order_id, label, actor_id)
  select iro.repair_order_id, 'Relance automatique de la facture ' || i.number || ' (niveau ' || p_level || ')', null
  from public.invoices i join public.invoice_repair_orders iro on iro.invoice_id = i.id
  where i.id = any (p_invoice_ids);
  return v_count;
end;
$$;
revoke execute on function public.record_overdue_reminder(uuid[], smallint) from public, anon, authenticated;

-- Fin de la relance du lundi : résumé à la direction
create function public.finish_overdue_reminders(p_clients integer, p_total numeric, p_failed integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
begin
  update public.app_settings set last_overdue_reminders_on = v_today;
  if p_clients > 0 or p_failed > 0 then
    insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
    values ('direction', 'overdue_summary',
            'Relance des impayés : ' || p_clients || ' client' || case when p_clients > 1 then 's' else '' end,
            to_char(p_total, 'FM999G999G990D00') || ' € TTC relancés'
              || case when p_failed > 0 then ' · ' || p_failed || ' envoi(s) en échec' else '' end,
            '/factures', 'overdue-summary-' || v_today)
    on conflict (dedupe_key) do nothing;
  end if;
end;
$$;
revoke execute on function public.finish_overdue_reminders(integer, numeric, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Réglage « ne pas relancer » d'une facture (bureau qui facture)
-- ---------------------------------------------------------------------------
create function public.set_invoice_auto_reminders(p_invoice_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_billing();
  update public.invoices set no_auto_reminders = not p_enabled where id = p_invoice_id;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.set_invoice_auto_reminders(uuid, boolean) from public, anon;
grant execute on function public.set_invoice_auto_reminders(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Lundi 9 h (heure de Paris, été comme hiver) : appel de la fonction Edge
-- ---------------------------------------------------------------------------
create function public.run_overdue_reminders()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'Europe/Paris';
begin
  if extract(isodow from v_now) <> 1 or extract(hour from v_now) <> 9 then
    return null;
  end if;
  if not exists (select 1 from public.app_settings
                 where mail_send_enabled and overdue_reminders_enabled
                   and last_overdue_reminders_on is distinct from v_now::date) then
    return null;
  end if;
  return public.invoke_edge_function('relances');
end;
$$;
revoke execute on function public.run_overdue_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- 7 h et 8 h UTC : 9 h à Paris en été et en hiver (la fonction vérifie l'heure de Paris)
    perform cron.schedule('rts-overdue-reminders', '0 7,8 * * 1', 'select public.run_overdue_reminders()');
  else
    raise notice 'pg_cron indisponible : relance automatique non planifiée';
  end if;
end;
$$;
