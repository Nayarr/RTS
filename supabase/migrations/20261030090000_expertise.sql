-- Expertise (travaux de main-d'œuvre réalisés avant le devis : diagnostic, contrôle…), une fois le devis accepté :
--   * 1 h d'expertise ou moins : le bureau choisit de l'offrir ou de la facturer (inchangé) ;
--   * plus d'1 h : le temps d'expertise est facturé moins 1 h. La première heure est offerte
--     d'office (sur les premières lignes), visible sur la facture avec 100 % de remise.
-- Les autres lignes (forfaits, lignes sans temps) restent au choix du bureau.

-- Répartition de la première heure offerte entre les lignes de main-d'œuvre, dans l'ordre.
create or replace function public.pre_quote_work_split(p_repair_order_id uuid)
returns table (id uuid, description text, is_labor boolean, hours numeric, suggested_price numeric,
               offered_hours numeric, billed_hours numeric, ord bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with w as (
    select w.id, w.description, w.hours, w.suggested_price, w.ord,
           l.line_type = 'labor' and coalesce(w.hours, 0) > 0 as is_labor
    from public.pre_quote_work_lines(p_repair_order_id) with ordinality as w(id, description, hours, suggested_price, ord)
    join public.ro_lines l on l.id = w.id
  ), t as (
    select w.*,
           sum(case when w.is_labor then w.hours else 0 end) over () as total,
           coalesce(sum(case when w.is_labor then w.hours else 0 end)
                      over (order by w.ord rows between unbounded preceding and 1 preceding), 0) as before
    from w
  ), s as (
    select t.*,
           case when t.is_labor and t.total > 1 then least(t.hours, greatest(1 - t.before, 0)) else 0 end as offered
    from t
  )
  select s.id, s.description, s.is_labor, s.hours, s.suggested_price,
         s.offered, case when s.is_labor then s.hours - s.offered else s.hours end, s.ord
  from s
  order by s.ord;
$$;

-- Décision en attente pour cet OR, avec la répartition de l'expertise.
create or replace function public.pre_quote_work(p_repair_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ro public.repair_orders;
  v_quote public.quotes;
  v_hours numeric;
begin
  if not public.is_office() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into v_ro from public.repair_orders where id = p_repair_order_id;
  if not found or v_ro.pre_quote_work_settled_at is not null or v_ro.status = 'invoiced' then
    return null;
  end if;
  select * into v_quote from public.quotes
  where repair_order_id = p_repair_order_id and status = 'accepted'
  order by accepted_at desc nulls last limit 1;
  if not found or exists (
    select 1 from public.invoice_repair_orders iro join public.invoices i on i.id = iro.invoice_id
    where iro.repair_order_id = p_repair_order_id and i.status = 'issued') then
    return null;
  end if;
  if not exists (select 1 from public.pre_quote_work_lines(p_repair_order_id)) then
    return null;
  end if;

  select coalesce(sum(s.hours) filter (where s.is_labor), 0) into v_hours
  from public.pre_quote_work_split(p_repair_order_id) s;

  return jsonb_build_object(
    'repair_order_id', v_ro.id,
    'repair_order_number', v_ro.number,
    'quote_id', v_quote.id,
    'quote_number', v_quote.number,
    'expertise_hours', v_hours,
    'first_hour_offered', v_hours > 1,
    'lines', (select jsonb_agg(jsonb_build_object(
                'id', s.id, 'description', s.description, 'hours', s.hours, 'is_labor', s.is_labor,
                'offered_hours', s.offered_hours, 'billed_hours', s.billed_hours,
                -- Prix proposé : celui de la part facturée (le temps moins la première heure offerte)
                'suggested_price', case when s.is_labor and v_hours > 1
                                        then round(s.suggested_price * s.billed_hours / s.hours, 2)
                                        else s.suggested_price end)
                order by s.ord)
              from public.pre_quote_work_split(p_repair_order_id) s));
end;
$$;

-- Décision du bureau. p_decisions : [{ "line_id": uuid, "decision": "billed" | "offered", "price": nombre }]
-- Plus d'1 h d'expertise : la décision des lignes de main-d'œuvre est imposée (1re heure offerte, le reste
-- facturé) ; seul le prix de la part facturée reste modifiable.
create or replace function public.settle_pre_quote_work(p_repair_order_id uuid, p_decisions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending jsonb;
  v_ro public.repair_orders;
  v_vat numeric;
  v_invoice_id uuid;
  v_number text;
  v_billed integer;
  v_offered integer;
  v_rows jsonb;
  v_hours numeric;
  v_rule boolean;
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id for update;
  v_pending := public.pre_quote_work(p_repair_order_id);
  if v_pending is null then
    raise exception 'Rien à décider : travaux déjà facturés ou offerts' using errcode = 'P0001';
  end if;
  v_hours := (v_pending ->> 'expertise_hours')::numeric;
  v_rule := v_hours > 1;

  -- Une entrée par ligne concernée : décision (imposée pour l'expertise de plus d'1 h), prix de la part
  -- facturée, prix de la part offerte (1re heure).
  select coalesce(jsonb_agg(jsonb_build_object(
           'line_id', s.id, 'description', s.description, 'ord', s.ord,
           'forced', v_rule and s.is_labor,
           'decision', case when v_rule and s.is_labor
                            then case when s.billed_hours > 0 then 'billed' else 'offered' end
                            else d.decision::text end,
           'price', case when v_rule and s.is_labor
                         then case when s.billed_hours > 0
                                   then coalesce(d.price, round(s.suggested_price * s.billed_hours / s.hours, 2))
                                   else round(s.suggested_price, 2) end
                         else d.price end,
           'offered_price', case when v_rule and s.is_labor and s.offered_hours > 0 and s.billed_hours > 0
                                 then round(s.suggested_price * s.offered_hours / s.hours, 2) end)
           order by s.ord), '[]'::jsonb)
    into v_rows
  from public.pre_quote_work_split(p_repair_order_id) s
  left join jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
         as d(line_id uuid, decision public.done_line_decision, price numeric) on d.line_id = s.id;

  if exists (select 1 from jsonb_array_elements(v_rows) r where r ->> 'decision' is null) then
    raise exception 'Choisis « facturer » ou « offrir » pour chaque ligne' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) r
             where r ->> 'decision' = 'billed' and coalesce((r ->> 'price')::numeric, 0) <= 0) then
    raise exception 'Indique un prix pour chaque ligne à facturer' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_rows) r where (r ->> 'price')::numeric < 0) then
    raise exception 'Prix invalide' using errcode = '22023';
  end if;
  if v_ro.client_id is null then
    raise exception 'Renseigne le client de l''OR avant de facturer' using errcode = 'P0001';
  end if;

  select count(*) filter (where r ->> 'decision' = 'billed'), count(*) filter (where r ->> 'decision' = 'offered')
    into v_billed, v_offered from jsonb_array_elements(v_rows) r;

  if v_billed > 0 then
    if exists (select 1 from public.invoice_repair_orders iro join public.invoices i on i.id = iro.invoice_id
               where iro.repair_order_id = p_repair_order_id and i.status = 'draft') then
      raise exception 'Un brouillon de facture existe déjà pour cet OR : termine-le ou supprime-le d''abord'
        using errcode = 'P0001';
    end if;

    select default_vat_rate into v_vat from public.company_settings;
    insert into public.invoices (client_id, vehicle_label, mileage)
    select v_ro.client_id, v.plate, v_ro.mileage from public.vehicles v where v.id = v_ro.vehicle_id
    returning id into v_invoice_id;
    insert into public.invoice_repair_orders (invoice_id, repair_order_id) values (v_invoice_id, p_repair_order_id);

    -- Lignes facturées au prix saisi ; lignes offertes visibles avec 100 % de remise.
    insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price,
                                      quantity, discount_percent, vat_rate, labor_category, source_ro_line_id)
    select v_invoice_id, p_repair_order_id, (r ->> 'ord')::integer * 10,
           'labor',
           case when r ->> 'decision' = 'billed' then r ->> 'description'
                when (r ->> 'forced')::boolean then (r ->> 'description') || ' — 1re heure d''expertise offerte'
                else (r ->> 'description') || ' — offert (geste commercial)' end,
           coalesce((r ->> 'price')::numeric, 0), 1,
           case when r ->> 'decision' = 'offered' then 100 else 0 end,
           v_vat, v_ro.vehicle_type::text::public.labor_category, (r ->> 'line_id')::uuid
    from jsonb_array_elements(v_rows) r;
    -- Ligne facturée en partie : sa part de la 1re heure offerte, juste en dessous.
    insert into public.invoice_lines (invoice_id, repair_order_id, position, line_type, description, unit_price,
                                      quantity, discount_percent, vat_rate, labor_category, source_ro_line_id)
    select v_invoice_id, p_repair_order_id, (r ->> 'ord')::integer * 10 + 1,
           'labor', (r ->> 'description') || ' — 1re heure d''expertise offerte',
           (r ->> 'offered_price')::numeric, 1, 100,
           v_vat, v_ro.vehicle_type::text::public.labor_category, (r ->> 'line_id')::uuid
    from jsonb_array_elements(v_rows) r
    where r ->> 'offered_price' is not null;

    v_number := public.issue_invoice(v_invoice_id);
  end if;

  update public.repair_orders set pre_quote_work_settled_at = now() where id = p_repair_order_id;
  -- Décision notée sur les lignes du devis accepté (verrouillé : écriture système).
  perform set_config('rts.system', 'on', true);
  update public.quote_lines ql set done_line_decision = (r ->> 'decision')::public.done_line_decision
  from jsonb_array_elements(v_rows) r
  where ql.quote_id = (v_pending ->> 'quote_id')::uuid and ql.source_ro_line_id = (r ->> 'line_id')::uuid;
  perform set_config('rts.system', '', true);

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id,
          'Travaux réalisés avant le devis : '
            || case when v_rule then 'expertise de ' || replace(rtrim(to_char(v_hours, 'FM990.99'), '.'), '.', ',')
                                 || ' h, 1re heure offerte ; '
                    else '' end
            || case when v_billed > 0 then v_billed || ' facturé(s) (facture ' || v_number || ')' else '' end
            || case when v_billed > 0 and v_offered > 0 then ', ' else '' end
            || case when v_offered > 0 then v_offered || ' offert(s)' else '' end,
          auth.uid());

  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_number,
                            'billed', v_billed, 'offered', v_offered, 'first_hour_offered', v_rule);
end;
$$;

revoke execute on function public.pre_quote_work_split(uuid) from public, anon, authenticated;
