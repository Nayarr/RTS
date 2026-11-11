-- Chiffre d'affaires de la main d'œuvre par catégorie (mécanique PL, VUL, et les deux autres
-- catégories de base, libellées dans Réglages › Taux horaires) sur les derniers mois : un CA par
-- catégorie dans les statistiques. Lignes de main d'œuvre des factures émises, remise déduite ;
-- une ligne sans catégorie compte en mécanique poids lourds. Les avoirs ne sont pas ventilés.
create function public.labor_revenue_by_category(p_months integer default 12)
returns table (category public.labor_category, label text, amount_ht numeric, hours numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_first date := (date_trunc('month', public.paris_date(now()))
                   - make_interval(months => greatest(p_months, 1) - 1))::date;
begin
  if not public.can_read_accounting() then
    raise exception 'Accès refusé : réservé à la direction' using errcode = '42501';
  end if;

  return query
  with lines as (
    select coalesce(il.labor_category, 'pl'::public.labor_category) as category,
           il.net_ht, coalesce(il.billed_hours, il.quantity) as hours
    from public.invoice_lines il
    join public.invoices i on i.id = il.invoice_id
    where i.status = 'issued' and il.line_type = 'labor'
      and i.issued_at >= (v_first::timestamp at time zone 'Europe/Paris')
  )
  select r.category, r.label,
         coalesce(sum(l.net_ht), 0)::numeric(12,2),
         coalesce(sum(l.hours), 0)::numeric(10,2)
  from public.labor_rates r
  left join lines l on l.category = r.category
  where r.category is not null
  group by r.category, r.label, r.sort_order
  order by r.sort_order, r.label;
end;
$$;

revoke execute on function public.labor_revenue_by_category(integer) from public, anon;
grant execute on function public.labor_revenue_by_category(integer) to authenticated;
