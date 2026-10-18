-- =============================================================================
-- RTS Atelier : devis envoyés restés sans réponse, traités en fin de mois
--
-- Le dernier jour travaillé du mois (samedi compris, jamais le dimanche), à 8 h :
--   - la réception et la direction sont prévenues (cloche et push) des devis envoyés que le
--     client n'a ni acceptés ni refusés ;
--   - l'OR d'origine de chacun quitte « Devis à faire » pour « Facture à faire » : le travail
--     déjà fait (diagnostic, contrôle) est facturé sans attendre. Le devis reste « Envoyé » :
--     le client peut toujours le signer.
-- =============================================================================

-- Dernier jour travaillé du mois (lundi au samedi) : le dernier jour, ou le samedi d'avant
-- s'il tombe un dimanche.
create function public.last_working_day_of_month(p_day date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when extract(isodow from d) = 7 then d - 1 else d end
  from (select (date_trunc('month', p_day) + interval '1 month - 1 day')::date as d) last_day;
$$;

create function public.month_end_unsigned_quotes(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_now at time zone 'Europe/Paris';
  v_month text := to_char(v_local, 'YYYY-MM');
  v_count integer;
  v_lines text;
  v_quote record;
begin
  -- Seulement le dernier jour travaillé du mois, à partir de 8 h, une fois par mois
  if v_local::date <> public.last_working_day_of_month(v_local::date) or extract(hour from v_local) < 8 then
    return 0;
  end if;
  if exists (select 1 from public.notifications where dedupe_key = 'quotes-month-end-' || v_month || '-direction') then
    return 0;
  end if;

  select count(*),
         string_agg(concat_ws(' · ', q.number, nullif(q.client_name, ''), q.plate,
                              replace(to_char(q.total_ttc, 'FM9999990.00'), '.', ',') || ' € TTC'),
                    E'\n' order by q.sent_at)
    into v_count, v_lines
  from public.v_quotes_overview q
  where q.status = 'sent';
  if v_count = 0 then
    return 0;
  end if;

  insert into public.notifications (recipient_role, type, title, body, link, dedupe_key)
  select role, 'quotes_unsigned',
         case when v_count = 1 then '1 devis envoyé sans réponse en fin de mois'
              else v_count || ' devis envoyés sans réponse en fin de mois' end,
         left(v_lines, 900) || E'\nLes OR en « Devis à faire » passent en « Facture à faire ».',
         '/devis?filtre=sent', 'quotes-month-end-' || v_month || '-' || role
  from (values ('direction'::public.app_role), ('reception'::public.app_role)) roles(role)
  on conflict (dedupe_key) do nothing;

  -- OR d'origine : le travail déjà fait est à facturer
  for v_quote in
    select q.number, q.repair_order_id
    from public.quotes q
    join public.repair_orders r on r.id = q.repair_order_id
    where q.status = 'sent' and r.status = 'quote_pending'
  loop
    update public.repair_orders set status = 'to_invoice'
    where id = v_quote.repair_order_id and status = 'quote_pending';
    insert into public.ro_events (repair_order_id, label)
    values (v_quote.repair_order_id,
            'Devis ' || coalesce(v_quote.number, '') || ' sans réponse en fin de mois : OR passé en « Facture à faire »');
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.month_end_unsigned_quotes(timestamptz) from public, anon, authenticated;
revoke execute on function public.last_working_day_of_month(date) from public, anon;

-- Alerte qui demande une action : aussi en push (à 8 h, rien à garder pour la nuit)
create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Information seule (location reconduite, OR signé, rappel des congés déjà poussés) : cloche seulement
  if new.type not in ('quote_response', 'pre_quote_work', 'kiosk_lockout', 'appointment_requested',
                      'rental_renewal_blocked', 'late_repair_order', 'overdue_invoice', 'low_stock',
                      'contract_service_due', 'appointment_reminder', 'quotes_unsigned') then
    return null;
  end if;
  perform public.queue_push(
    case when new.recipient_profile_id is not null then array[new.recipient_profile_id]
         else public.profiles_with_roles(array[new.recipient_role]) end,
    new.title, new.body, new.link, 'notification-' || coalesce(new.dedupe_key, new.id::text),
    -- Réponse d'un client : tout de suite ; le reste attend le matin la nuit
    case when new.type <> 'quote_response' then public.push_quiet_until() end);
  return null;
end;
$$;

-- Toutes les heures : le traitement ne se fait qu'une fois, le dernier jour travaillé dès 8 h.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-month-end-quotes', '5 * * * *', 'select public.month_end_unsigned_quotes()');
  else
    raise notice 'pg_cron indisponible : devis de fin de mois non planifiés';
  end if;
end;
$$;
