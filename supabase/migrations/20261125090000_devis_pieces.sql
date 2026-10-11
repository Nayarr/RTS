-- Devis, factures et pièces (retours du client)
--   * SIRET partout à la place du SIREN : 14 chiffres et clé de contrôle (formule de Luhn ;
--     La Poste fait exception : somme des chiffres multiple de 5). Les SIREN déjà saisis ne
--     sont pas des SIRET : ils sont effacés (champ à compléter), sauf s'ils sont déjà valides.
--   * Base de pièces : référence véhicule, référence pièce, prix d'achat, frais de port et
--     marge (montant ou pourcentage) ; le prix de vente HT est calculé. Le bureau (direction
--     et réception) enregistre les pièces saisies sur un devis ou une facture.
--   * Statistiques pièces : utilisations, quantités vendues, chiffre d'affaires et marge.

-- ---------------------------------------------------------------------------
-- SIRET
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_siret(p_siret text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_siret ~ '^[0-9]{14}$'
     and case
           -- La Poste : SIREN 356000000, somme simple des chiffres multiple de 5
           when left(p_siret, 9) = '356000000' then
             (select sum(substr(p_siret, i, 1)::int) from generate_series(1, 14) as i) % 5 = 0
           else
             (select sum(case when (14 - i) % 2 = 1
                              then (substr(p_siret, i, 1)::int * 2) - case when substr(p_siret, i, 1)::int >= 5 then 9 else 0 end
                              else substr(p_siret, i, 1)::int end)
              from generate_series(1, 14) as i) % 10 = 0
         end;
$$;
comment on function public.is_valid_siret(text) is
  'SIRET valide : 14 chiffres et clé de Luhn (La Poste : somme des chiffres multiple de 5).';

-- Clients : siren → siret (chiffres seuls), SIREN effacés
alter table public.clients rename column siren to siret;
update public.clients set siret = nullif(regexp_replace(siret, '[^0-9]', '', 'g'), '') where siret is not null;
update public.clients set siret = null where siret is not null and not public.is_valid_siret(siret);
alter table public.clients
  add constraint clients_siret_check check (siret is null or public.is_valid_siret(siret));
alter view public.v_clients_overview rename column siren to siret;

-- Factures : instantané du SIRET (les factures déjà émises gardent le numéro imprimé)
alter table public.invoices rename column client_siren to client_siret;
alter view public.v_invoices_overview rename column client_siren to client_siret;

-- Entreprise : seul le SIRET reste (le SIREN en est les 9 premiers chiffres)
alter table public.company_settings drop column siren;
update public.company_settings set siret = nullif(regexp_replace(siret, '[^0-9]', '', 'g'), '');
update public.company_settings set siret = null where siret is not null and not public.is_valid_siret(siret);
alter table public.company_settings
  add constraint company_settings_siret_check check (siret is null or public.is_valid_siret(siret));

create or replace function public.issue_invoice(p_invoice_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_client public.clients;
  v_terms integer;
  v_ht numeric;
  v_vat numeric;
  v_number text;
begin
  perform public.assert_office();

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
  if v_invoice.status <> 'draft' then
    raise exception 'Cette facture est déjà émise (%)', v_invoice.number using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id and line_type <> 'text') then
    raise exception 'La facture est vide' using errcode = 'P0001';
  end if;

  select * into v_client from public.clients where id = v_invoice.client_id;
  select payment_terms_days into v_terms from public.company_settings;

  select coalesce(sum(net_ht), 0) into v_ht from public.invoice_lines where invoice_id = p_invoice_id;
  select coalesce(sum(round(g.base * g.vat_rate / 100, 2)), 0) into v_vat
  from (
    select vat_rate, sum(net_ht) as base
    from public.invoice_lines
    where invoice_id = p_invoice_id and line_type <> 'text'
    group by vat_rate
  ) g;

  perform set_config('rts.issuing', 'on', true);
  v_number := public.next_document_number('invoice');

  update public.invoices set
    status = 'issued',
    number = v_number,
    issued_at = now(),
    service_date = coalesce(service_date, current_date),
    due_date = current_date + v_terms,
    client_name = v_client.name,
    client_address = v_client.billing_address,
    client_siret = v_client.siret,
    client_email = v_client.email,
    total_ht = v_ht,
    total_vat = v_vat,
    total_ttc = v_ht + v_vat,
    issued_by = auth.uid()
  where id = p_invoice_id;

  update public.repair_orders r set status = 'invoiced'
  from public.invoice_repair_orders iro
  where iro.invoice_id = p_invoice_id and iro.repair_order_id = r.id;

  insert into public.ro_events (repair_order_id, label, actor_id)
  select iro.repair_order_id, 'Facture ' || v_number || ' émise', auth.uid()
  from public.invoice_repair_orders iro where iro.invoice_id = p_invoice_id;

  perform set_config('rts.issuing', '', true);
  return v_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Base de pièces
-- ---------------------------------------------------------------------------

create type public.margin_kind as enum ('amount', 'percent');

alter table public.parts
  add column vehicle_ref   text,
  add column shipping_cost numeric(12,2) check (shipping_cost >= 0),
  add column margin_kind   public.margin_kind not null default 'percent',
  add column margin_value  numeric(12,2) check (margin_value >= 0);
comment on column public.parts.vehicle_ref is 'Référence véhicule (modèle, type ou VIN) pour laquelle la pièce a été commandée.';
comment on column public.parts.manufacturer_ref is 'Référence pièce.';
comment on column public.parts.shipping_cost is 'Frais de port par pièce, repris dans le prix de vente.';
comment on column public.parts.margin_value is 'Marge en euros ou en pourcentage du coût (achat + port) ; le prix de vente HT en découle.';

-- Prix de vente HT = achat + port + marge (montant ou pourcentage du coût).
create or replace function public.part_sale_price(
  p_purchase numeric, p_shipping numeric, p_kind public.margin_kind, p_margin numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_purchase is null or p_margin is null then null
    when p_kind = 'amount' then round(p_purchase + coalesce(p_shipping, 0) + p_margin, 2)
    else round((p_purchase + coalesce(p_shipping, 0)) * (1 + p_margin / 100), 2)
  end;
$$;

create or replace function public.parts_compute_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.margin_value is not null and new.purchase_price is not null then
    new.sale_price := public.part_sale_price(new.purchase_price, new.shipping_cost, new.margin_kind, new.margin_value);
  end if;
  return new;
end;
$$;

create trigger parts_compute_sale_price
  before insert or update on public.parts
  for each row execute function public.parts_compute_sale_price();

create index parts_manufacturer_ref_idx on public.parts (lower(manufacturer_ref)) where is_active;

-- Le bureau enregistre les pièces saisies sur ses devis et factures ; la direction seule supprime.
drop policy parts_write on public.parts;
create policy parts_insert on public.parts for insert to authenticated with check (public.is_office());
create policy parts_update on public.parts for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy parts_delete on public.parts for delete to authenticated using (public.is_direction());

-- Statistiques : pièces facturées (factures émises) et devis où elles apparaissent.
create view public.v_part_stats
with (security_invoker = on) as
select
  p.id,
  p.designation,
  p.vehicle_ref,
  p.manufacturer_ref,
  p.brand,
  p.oem_ref,
  p.supplier_id,
  sp.name as supplier_name,
  p.purchase_price,
  p.shipping_cost,
  p.margin_kind,
  p.margin_value,
  p.sale_price,
  coalesce(s.invoices_count, 0) as invoices_count,
  coalesce(q.quotes_count, 0) as quotes_count,
  coalesce(s.quantity_sold, 0) as quantity_sold,
  coalesce(s.revenue_ht, 0) as revenue_ht,
  coalesce(s.margin_ht, 0) as margin_ht,
  s.last_sold_at
from public.parts p
left join public.suppliers sp on sp.id = p.supplier_id
left join lateral (
  select count(distinct il.invoice_id) as invoices_count,
         sum(il.quantity) as quantity_sold,
         sum(il.net_ht) as revenue_ht,
         sum(il.net_ht - coalesce(il.purchase_price, 0) * il.quantity - coalesce(il.shipping_cost, 0)) as margin_ht,
         max(i.issued_at) as last_sold_at
  from public.invoice_lines il
  join public.invoices i on i.id = il.invoice_id
  where il.part_id = p.id and i.status = 'issued'
) s on true
left join lateral (
  select count(distinct ql.quote_id) as quotes_count from public.quote_lines ql where ql.part_id = p.id
) q on true
where p.is_active;
comment on view public.v_part_stats is 'Pièces les plus utilisées et marges réalisées (factures émises).';

revoke execute on function public.is_valid_siret(text) from public, anon;
grant execute on function public.is_valid_siret(text) to authenticated;
revoke execute on function public.part_sale_price(numeric, numeric, public.margin_kind, numeric) from public, anon;
grant execute on function public.part_sale_price(numeric, numeric, public.margin_kind, numeric) to authenticated;
revoke execute on function public.parts_compute_sale_price() from public, anon, authenticated;
