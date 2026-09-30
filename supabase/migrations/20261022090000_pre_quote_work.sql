-- =============================================================================
-- RTS Atelier — Travaux réalisés avant le devis : facturer ou offrir
--
-- Reprise de l'ancienne appli : un technicien fait un diagnostic / contrôle sur un OR,
-- le bureau fait un devis, le client l'accepte. Les travaux déjà effectués sur cet OR
-- doivent alors être tranchés ligne par ligne :
--   - facturés (prix proposé = taux horaire × temps, modifiable) sur une facture séparée
--     émise tout de suite ;
--   - ou offerts (geste commercial) : ils figurent sur cette facture avec 100 % de remise.
-- Tant que ce n'est pas décidé, l'OR l'affiche et la cloche le rappelle.
-- =============================================================================

alter table public.repair_orders add column pre_quote_work_settled_at timestamptz;
comment on column public.repair_orders.pre_quote_work_settled_at is
  'Travaux réalisés avant le devis facturés / offerts (décision du bureau après acceptation du devis).';

-- Lignes concernées : travaux effectués de l'OR (hors texte et pièces), avec le prix proposé.
create or replace function public.pre_quote_work_lines(p_repair_order_id uuid)
returns table (id uuid, description text, hours numeric, suggested_price numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.description, h.hours,
         coalesce(nullif(l.unit_price, 0) * case when l.line_type = 'package' then l.quantity else 1 end,
                  round(public.labor_rate_for(r.client_id, r.vehicle_type) * coalesce(h.hours, 0), 2))
  from public.ro_lines l
  join public.repair_orders r on r.id = l.repair_order_id
  cross join lateral (
    select coalesce(nullif(l.billed_hours, 0), nullif(l.standard_hours, 0), nullif(l.estimated_hours, 0)) as hours
  ) h
  where l.repair_order_id = p_repair_order_id and l.kind = 'done'
    and l.line_type not in ('text', 'part') and btrim(l.description) <> ''
  order by l.position, l.created_at;
$$;

-- Décision en attente pour cet OR ? (devis accepté, OR pas encore facturé, travaux effectués présents)
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

  return jsonb_build_object(
    'repair_order_id', v_ro.id,
    'repair_order_number', v_ro.number,
    'quote_id', v_quote.id,
    'quote_number', v_quote.number,
    'lines', (select jsonb_agg(jsonb_build_object('id', w.id, 'description', w.description, 'hours', w.hours,
                                                  'suggested_price', w.suggested_price))
              from public.pre_quote_work_lines(p_repair_order_id) w));
end;
$$;

-- Décision du bureau. p_decisions : [{ "line_id": uuid, "decision": "billed" | "offered", "price": nombre }]
-- Une facture est émise dès qu'une ligne est facturée ; tout offert : décision notée, rien à facturer.
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
begin
  perform public.assert_office();
  select * into v_ro from public.repair_orders where id = p_repair_order_id for update;
  v_pending := public.pre_quote_work(p_repair_order_id);
  if v_pending is null then
    raise exception 'Rien à décider : travaux déjà facturés ou offerts' using errcode = 'P0001';
  end if;

  -- Une entrée par ligne concernée, avec la décision reçue (null si absente).
  select coalesce(jsonb_agg(jsonb_build_object('line_id', w.id, 'description', w.description,
                                               'decision', d.decision, 'price', d.price, 'ord', w.ord)), '[]'::jsonb)
    into v_rows
  from public.pre_quote_work_lines(p_repair_order_id) with ordinality as w(id, description, hours, suggested_price, ord)
  left join jsonb_to_recordset(coalesce(p_decisions, '[]'::jsonb))
         as d(line_id uuid, decision public.done_line_decision, price numeric) on d.line_id = w.id;

  if exists (select 1 from jsonb_to_recordset(v_rows) as d(line_id uuid, description text, decision public.done_line_decision, price numeric, ord integer) where d.decision is null) then
    raise exception 'Choisis « facturer » ou « offrir » pour chaque ligne' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_rows) as d(line_id uuid, description text, decision public.done_line_decision, price numeric, ord integer) where d.decision = 'billed' and coalesce(d.price, 0) <= 0) then
    raise exception 'Indique un prix pour chaque ligne à facturer' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_to_recordset(v_rows) as d(line_id uuid, description text, decision public.done_line_decision, price numeric, ord integer) where d.price < 0) then
    raise exception 'Prix invalide' using errcode = '22023';
  end if;
  if v_ro.client_id is null then
    raise exception 'Renseigne le client de l''OR avant de facturer' using errcode = 'P0001';
  end if;

  select count(*) filter (where d.decision = 'billed'), count(*) filter (where d.decision = 'offered')
    into v_billed, v_offered from jsonb_to_recordset(v_rows) as d(line_id uuid, description text, decision public.done_line_decision, price numeric, ord integer);

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
    select v_invoice_id, p_repair_order_id, d.ord * 10,
           'labor',
           case when d.decision = 'offered' then d.description || ' — offert (geste commercial)' else d.description end,
           coalesce(d.price, 0), 1,
           case when d.decision = 'offered' then 100 else 0 end,
           v_vat, v_ro.vehicle_type::text::public.labor_category, d.line_id
    from jsonb_to_recordset(v_rows) as d(line_id uuid, description text, decision public.done_line_decision, price numeric, ord integer);

    v_number := public.issue_invoice(v_invoice_id);
  end if;

  update public.repair_orders set pre_quote_work_settled_at = now() where id = p_repair_order_id;
  -- Décision notée sur les lignes du devis accepté (verrouillé : écriture système).
  perform set_config('rts.system', 'on', true);
  update public.quote_lines ql set done_line_decision = d.decision
  from jsonb_to_recordset(v_rows) as d(line_id uuid, description text, decision public.done_line_decision, price numeric, ord integer)
  where ql.quote_id = (v_pending ->> 'quote_id')::uuid and ql.source_ro_line_id = d.line_id;
  perform set_config('rts.system', '', true);

  insert into public.ro_events (repair_order_id, label, actor_id)
  values (p_repair_order_id,
          'Travaux réalisés avant le devis : '
            || case when v_billed > 0 then v_billed || ' facturé(s) (facture ' || v_number || ')' else '' end
            || case when v_billed > 0 and v_offered > 0 then ', ' else '' end
            || case when v_offered > 0 then v_offered || ' offert(s)' else '' end,
          auth.uid());

  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_number,
                            'billed', v_billed, 'offered', v_offered);
end;
$$;

-- Rappel dans la cloche : devis accepté, travaux avant devis pas encore tranchés.
create or replace function public.pre_quote_work_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.notifications (recipient_role, type, title, body, repair_order_id, link, dedupe_key)
  select role, 'pre_quote_work', 'Travaux avant devis à facturer ou offrir : ' || v.plate,
         'Devis ' || coalesce(q.number, '') || ' accepté — OR ' || r.number,
         r.id, '/or/' || r.id, 'pre-quote-work-' || r.id || '-' || role
  from public.repair_orders r
  join public.vehicles v on v.id = r.vehicle_id
  join public.quotes q on q.repair_order_id = r.id and q.status = 'accepted'
  cross join (values ('direction'::public.app_role), ('reception'::public.app_role)) roles(role)
  where r.pre_quote_work_settled_at is null and r.status <> 'invoiced'
    and exists (select 1 from public.pre_quote_work_lines(r.id))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function
  public.pre_quote_work_lines(uuid),
  public.pre_quote_work(uuid),
  public.settle_pre_quote_work(uuid, jsonb),
  public.pre_quote_work_alerts()
from public, anon, authenticated;
grant execute on function public.pre_quote_work(uuid), public.settle_pre_quote_work(uuid, jsonb) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rts-pre-quote-work-alerts', '*/5 * * * *', 'select public.pre_quote_work_alerts()');
  else
    raise notice 'pg_cron indisponible : rappel des travaux avant devis non planifié';
  end if;
end;
$$;
