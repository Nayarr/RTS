-- =============================================================================
-- RTS Atelier — Intégrité de la facturation (audit)
--
--   - un OR n'est facturé qu'une fois : une nouvelle facture n'est possible qu'après
--     un avoir couvrant toute la facture précédente (parcours « avoir puis nouvelle
--     facture » de l'aide) ;
--   - un OR facturé est figé (statut et champs), sauf après un avoir total ;
--   - un contrat d'entretien n'est facturé qu'une fois par mois ;
--   - un paiement ne peut pas être daté dans le futur.
-- =============================================================================

-- Facture émise et non entièrement annulée par avoir qui couvre déjà cet OR (son numéro), sinon null.
create or replace function public.active_invoice_number(p_repair_order_id uuid, p_exclude_invoice_id uuid default null)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select i.number
  from public.invoice_repair_orders iro
  join public.invoices i on i.id = iro.invoice_id
  where iro.repair_order_id = p_repair_order_id
    and i.status = 'issued'
    and i.id is distinct from p_exclude_invoice_id
    and coalesce((select sum(c.total_ttc) from public.credit_notes c where c.invoice_id = i.id), 0) < i.total_ttc - 0.01
  order by i.issued_at
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 1. Pas de seconde facture pour un OR déjà facturé (brouillon, facture groupée, émission)
-- ---------------------------------------------------------------------------
create or replace function public.invoice_repair_orders_single_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_number text;
  v_ro text;
begin
  if public.is_migration_context() then
    return new;
  end if;
  v_number := public.active_invoice_number(new.repair_order_id, new.invoice_id);
  if v_number is not null then
    select number into v_ro from public.repair_orders where id = new.repair_order_id;
    raise exception 'OR % déjà facturé (%) : fais d''abord un avoir sur cette facture', v_ro, v_number
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger invoice_repair_orders_single_billing
  before insert on public.invoice_repair_orders
  for each row execute function public.invoice_repair_orders_single_billing();

-- Émission : un autre brouillon a pu être émis entre-temps pour le même OR.
create or replace function public.invoices_single_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro record;
begin
  if public.is_migration_context() or old.status <> 'draft' or new.status <> 'issued' then
    return new;
  end if;
  select r.number, public.active_invoice_number(r.id, new.id) as billed into v_ro
  from public.invoice_repair_orders iro join public.repair_orders r on r.id = iro.repair_order_id
  where iro.invoice_id = new.id and public.active_invoice_number(r.id, new.id) is not null
  limit 1;
  if found then
    raise exception 'OR % déjà facturé (%) : fais d''abord un avoir sur cette facture', v_ro.number, v_ro.billed
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger invoices_single_billing
  before update on public.invoices
  for each row execute function public.invoices_single_billing();

-- ---------------------------------------------------------------------------
-- 2. OR facturé figé : seul un avoir total rouvre la possibilité de le modifier
-- ---------------------------------------------------------------------------
create or replace function public.repair_orders_invoiced_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Colonnes tenues à jour automatiquement (pas une modification de l'OR par quelqu'un)
  v_auto text[] := array['updated_at', 'assignment_changed_at', 'pre_quote_work_settled_at'];
begin
  if old.status <> 'invoiced' or public.is_migration_context() or public.is_system_context() then
    return new;
  end if;
  if (to_jsonb(new) - v_auto) is not distinct from (to_jsonb(old) - v_auto) then
    return new;
  end if;
  if public.active_invoice_number(old.id) is not null then
    raise exception 'OR facturé (%) : il ne peut plus être modifié (passer par un avoir)',
      public.active_invoice_number(old.id) using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger repair_orders_invoiced_lock
  before update on public.repair_orders
  for each row execute function public.repair_orders_invoiced_lock();

-- ---------------------------------------------------------------------------
-- 3. Contrat d'entretien : une facture par mois (le brouillon du mois est repris)
-- ---------------------------------------------------------------------------
create or replace function public.build_contract_invoice_draft(p_contract_id uuid, p_month date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contract public.maintenance_contracts;
  v_month date := date_trunc('month', coalesce(p_month, public.paris_date(now())))::date;
  v_plates text;
  v_invoice_id uuid;
  v_month_label text;
  v_existing public.invoices;
begin
  perform public.assert_office();
  select * into v_contract from public.maintenance_contracts where id = p_contract_id for update;
  if not found then
    raise exception 'Contrat introuvable' using errcode = 'P0002';
  end if;
  if v_contract.monthly_price_ht is null or v_contract.monthly_price_ht <= 0 then
    raise exception 'Indique le prix mensuel du contrat avant de le facturer' using errcode = 'P0001';
  end if;

  v_month_label := (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
                          'octobre', 'novembre', 'décembre'])[extract(month from v_month)::int]
                   || ' ' || extract(year from v_month)::int;

  -- Déjà une facture pour ce mois : brouillon repris, facture émise (non annulée) refusée.
  for v_existing in
    select * from public.invoices i
    where i.maintenance_contract_id = p_contract_id and i.service_date = v_month
    order by i.status desc, i.created_at
  loop
    if v_existing.status = 'draft' then
      return v_existing.id;
    end if;
    if coalesce((select sum(c.total_ttc) from public.credit_notes c where c.invoice_id = v_existing.id), 0)
         < v_existing.total_ttc - 0.01 then
      raise exception 'Contrat déjà facturé pour % (%)', v_month_label, v_existing.number using errcode = 'P0001';
    end if;
  end loop;

  select string_agg(v.plate, ', ' order by v.plate) into v_plates
  from public.maintenance_contract_vehicles mcv join public.vehicles v on v.id = mcv.vehicle_id
  where mcv.contract_id = p_contract_id;

  insert into public.invoices (client_id, vehicle_label, maintenance_contract_id, service_date, created_by)
  values (v_contract.client_id, 'Contrat d''entretien', p_contract_id, v_month, auth.uid())
  returning id into v_invoice_id;

  insert into public.invoice_lines (invoice_id, position, line_type, description, unit_price, quantity, vat_rate)
  values (v_invoice_id, 0, 'package',
          'Contrat d''entretien — ' || coalesce(nullif(v_contract.service_description, ''), 'entretien') || ' — '
            || v_month_label || coalesce(E'\nVéhicules : ' || v_plates, ''),
          v_contract.monthly_price_ht, 1, (select default_vat_rate from public.company_settings));
  return v_invoice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Paiement : jamais daté dans le futur
-- ---------------------------------------------------------------------------
create or replace function public.payments_not_in_future()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_migration_context() and new.paid_on > public.paris_date(now()) then
    raise exception 'La date du paiement ne peut pas être dans le futur' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger payments_not_in_future
  before insert or update on public.payments
  for each row execute function public.payments_not_in_future();

revoke execute on function
  public.active_invoice_number(uuid, uuid),
  public.invoice_repair_orders_single_billing(),
  public.invoices_single_billing(),
  public.repair_orders_invoiced_lock(),
  public.payments_not_in_future()
from public, anon, authenticated;
