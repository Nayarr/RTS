-- =============================================================================
-- RTS Atelier — Pilotage : statistiques mensuelles et trésorerie (direction)
--   Statistiques : chiffre d'affaires HT des 12 derniers mois (main d'œuvre /
--   forfaits, pièces, marge pièces), avoirs déduits le mois de leur émission.
--   Trésorerie : encaissé du mois, à encaisser sous 30 jours, retards,
--   encaissements attendus sur 8 semaines, impayés et habitudes de paiement.
-- =============================================================================

create or replace function public.monthly_statistics(p_months integer default 12)
returns table (
  month            date,
  invoice_count    bigint,
  labor_ht         numeric,
  parts_ht         numeric,
  parts_margin_ht  numeric,
  credit_notes_ht  numeric,
  total_ht         numeric
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first date := (date_trunc('month', public.paris_date(now()))
                   - make_interval(months => greatest(p_months, 1) - 1))::date;
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;

  return query
  with months as (
    select m::date as month
    from generate_series(v_first, date_trunc('month', public.paris_date(now()))::date, interval '1 month') m
  ),
  credits as (
    select date_trunc('month', cn.issued_at at time zone 'Europe/Paris')::date as month, sum(cn.amount_ht) as amount
    from public.credit_notes cn
    where cn.issued_at >= (v_first::timestamp at time zone 'Europe/Paris')
    group by 1
  )
  select
    m.month,
    coalesce(r.invoice_count, 0),
    coalesce(r.labor_ht, 0),
    coalesce(r.parts_ht, 0),
    coalesce(r.parts_margin_ht, 0),
    coalesce(c.amount, 0),
    coalesce(r.total_ht, 0) - coalesce(c.amount, 0)
  from months m
  left join public.v_monthly_revenue r on r.month = m.month
  left join credits c on c.month = m.month
  order by m.month;
end;
$$;

revoke execute on function public.monthly_statistics(integer) from public, anon;
grant execute on function public.monthly_statistics(integer) to authenticated;

create or replace function public.treasury_overview()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_today date := public.paris_date(now());
  v_month date := date_trunc('month', public.paris_date(now()))::date;
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'collected_this_month', (
      select coalesce(sum(p.amount_ttc), 0) from public.payments p where p.paid_on >= v_month
    ),
    'due_within_30_days', (
      select coalesce(sum(b.balance_due), 0) from public.v_invoice_balances b
      where b.balance_due > 0.01 and b.due_date >= v_today and b.due_date <= v_today + 30
    ),
    'overdue', (
      select coalesce(sum(b.balance_due), 0) from public.v_invoice_balances b
      where b.balance_due > 0.01 and b.due_date < v_today
    ),
    -- Encaissements attendus : reste dû des factures par semaine d'échéance, à partir d'aujourd'hui.
    'weeks', (
      select jsonb_agg(jsonb_build_object(
               'starts_on', w.starts_on,
               'amount', (select coalesce(sum(b.balance_due), 0) from public.v_invoice_balances b
                          where b.balance_due > 0.01 and b.due_date >= w.starts_on and b.due_date < w.starts_on + 7))
             order by w.starts_on)
      from (select v_today + i * 7 as starts_on from generate_series(0, 7) i) w
    ),
    'overdue_by_client', coalesce((
      select jsonb_agg(jsonb_build_object(
               'client_id', x.client_id, 'client_name', x.client_name,
               'invoice_count', x.invoice_count, 'amount', x.amount, 'max_days_late', x.max_days_late)
             order by x.amount desc, x.client_name)
      from (
        select b.client_id, max(b.client_name) as client_name, count(*) as invoice_count,
               sum(b.balance_due) as amount, max(v_today - b.due_date) as max_days_late
        from public.v_invoice_balances b
        where b.balance_due > 0.01 and b.due_date < v_today
        group by b.client_id
      ) x
    ), '[]'::jsonb),
    -- Habitudes : délai moyen entre l'échéance et le dernier paiement des factures soldées.
    'payment_habits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'client_id', x.client_id, 'client_name', x.client_name,
               'invoice_count', x.invoice_count, 'average_delay_days', x.average_delay_days)
             order by x.average_delay_days desc, x.client_name)
      from (
        select b.client_id, max(b.client_name) as client_name, count(*) as invoice_count,
               round(avg(b.last_paid_on - b.due_date))::integer as average_delay_days
        from public.v_invoice_balances b
        where b.payment_status = 'paid' and b.last_paid_on is not null
        group by b.client_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.treasury_overview() from public, anon;
grant execute on function public.treasury_overview() to authenticated;
