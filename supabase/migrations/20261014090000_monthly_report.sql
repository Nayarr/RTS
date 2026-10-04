-- =============================================================================
-- RTS Atelier : Pilotage : rapport mensuel (direction)
--   Chiffres clés du mois, factures en retard et échéances véhicules proches.
--   Les meilleurs clients et les techniciens viennent de profitability_report
--   et technician_performance sur le même mois.
-- =============================================================================

create or replace function public.monthly_report(p_month date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_from timestamptz := v_start::timestamp at time zone 'Europe/Paris';
  v_to timestamptz := v_end::timestamp at time zone 'Europe/Paris';
  v_today date := public.paris_date(now());
  v_sales record;
  v_credits numeric;
begin
  if not public.is_direction() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;

  select count(distinct e.invoice_id) as invoice_count,
         coalesce(sum(e.labor_ht), 0) as labor_ht,
         coalesce(sum(e.parts_ht), 0) as parts_ht,
         coalesce(sum(e.parts_margin_ht), 0) as parts_margin_ht,
         coalesce(sum(e.net_ht), 0) as total_ht
    into v_sales
  from public.v_invoice_line_economics e
  where e.issued_at >= v_from and e.issued_at < v_to;

  select coalesce(sum(cn.amount_ht), 0) into v_credits
  from public.credit_notes cn
  where cn.issued_at >= v_from and cn.issued_at < v_to;

  return jsonb_build_object(
    'month', v_start,
    'figures', jsonb_build_object(
      'revenue_ht', v_sales.total_ht - v_credits,
      'labor_ht', v_sales.labor_ht,
      'parts_ht', v_sales.parts_ht,
      'parts_margin_ht', v_sales.parts_margin_ht,
      'credit_notes_ht', v_credits,
      'invoice_count', v_sales.invoice_count,
      'collected_ttc', (select coalesce(sum(p.amount_ttc), 0) from public.payments p
                        where p.paid_on >= v_start and p.paid_on < v_end),
      'outstanding_ttc', (select coalesce(sum(b.balance_due), 0) from public.v_invoice_balances b
                          where b.balance_due > 0.01),
      'overdue_ttc', (select coalesce(sum(b.balance_due), 0) from public.v_invoice_balances b
                      where b.balance_due > 0.01 and b.due_date < v_today),
      'repair_orders_opened', (select count(*) from public.repair_orders r
                               where r.created_at >= v_from and r.created_at < v_to),
      'quotes_accepted', (select count(*) from public.quotes q
                          where q.accepted_at >= v_from and q.accepted_at < v_to)
    ),
    -- Factures en retard aujourd'hui (à relancer), les plus gros restes dus d'abord.
    'overdue_invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'invoice_id', x.invoice_id, 'number', x.number, 'client_name', x.client_name,
               'issued_at', x.issued_at, 'balance_due', x.balance_due)
             order by x.balance_due desc, x.number)
      from (
        select b.invoice_id, b.number, b.client_name, b.issued_at, b.balance_due
        from public.v_invoice_balances b
        where b.balance_due > 0.01 and b.due_date < v_today
        order by b.balance_due desc, b.number
        limit 12
      ) x
    ), '[]'::jsonb),
    -- Échéances véhicules dépassées ou dans les 30 jours.
    'deadlines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'plate', d.plate, 'client_name', d.client_name, 'kind', d.kind,
               'due_date', d.due_date, 'days_left', d.days_left)
             order by d.due_date, d.plate)
      from (
        select * from public.v_vehicle_deadlines order by due_date, plate limit 20
      ) d
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.monthly_report(date) from public, anon;
grant execute on function public.monthly_report(date) to authenticated;
