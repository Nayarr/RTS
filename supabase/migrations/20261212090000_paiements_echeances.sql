-- =============================================================================
-- Paiements : type de compte du client, échéance d'une facture émise modifiable
--
-- * Type de compte du client : comptant (réglé à la remise du véhicule) ou prélèvement. Il est
--   affiché sur sa fiche et sur ses factures, et propose le mode du paiement à enregistrer.
-- * Échéance : une facture émise reste figée, sauf sa date d'échéance, que le bureau peut
--   déplacer (accord avec le client). Jamais avant la date d'émission ; chaque changement est
--   gardé (ancienne date, nouvelle date, qui, quand).
-- =============================================================================

alter table public.clients
  add column account_type text not null default 'comptant' check (account_type in ('comptant', 'prelevement'));
comment on column public.clients.account_type is 'Type de compte : comptant ou prélèvement.';

-- La liste des clients reprend la nouvelle colonne (c.* est figé à la création de la vue)
drop view public.v_clients_overview;
create view public.v_clients_overview
with (security_invoker = on) as
select
  c.*,
  coalesce(v.count, 0) as vehicles_count,
  coalesce(r.count, 0) as orders_count,
  r.last_visit,
  coalesce(i.revenue_ht, 0) as revenue_ht,
  coalesce(i.balance_due, 0) as balance_due,
  coalesce(i.overdue_count, 0) as overdue_invoices_count
from public.clients c
left join lateral (
  select count(*) as count from public.vehicles where client_id = c.id
) v on true
left join lateral (
  select count(*) as count, max(created_at) as last_visit from public.repair_orders where client_id = c.id
) r on true
left join lateral (
  select sum(t.total_ht) as revenue_ht,
         sum(greatest(b.balance_due, 0)) as balance_due,
         count(*) filter (where b.payment_status = 'overdue') as overdue_count
  from public.invoices inv
  join public.v_invoice_totals t on t.invoice_id = inv.id
  left join public.v_invoice_balances b on b.invoice_id = inv.id
  where inv.client_id = c.id and inv.status = 'issued'
) i on true;
revoke all on public.v_clients_overview from public, anon;
grant select on public.v_clients_overview to authenticated;

-- ---------------------------------------------------------------------------
-- Échéance d'une facture émise
-- ---------------------------------------------------------------------------

create table public.invoice_due_date_changes (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  old_date    date,
  new_date    date not null,
  changed_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  changed_at  timestamptz not null default now()
);
create index invoice_due_date_changes_invoice_idx on public.invoice_due_date_changes (invoice_id);
comment on table public.invoice_due_date_changes is 'Échéances de facture déplacées après l''émission.';

alter table public.invoice_due_date_changes enable row level security;
revoke all on public.invoice_due_date_changes from public, anon, authenticated;
grant select on public.invoice_due_date_changes to authenticated;
create policy invoice_due_date_changes_select on public.invoice_due_date_changes for select to authenticated
  using ((select public.is_office()));

-- La garde des factures émises laisse passer l'échéance quand elle vient de set_invoice_due_date
create or replace function public.invoices_guard()
returns trigger
language plpgsql
as $$
declare
  v_mutable text[] := array['public_token', 'pdf_file_id', 'updated_at'];
begin
  if public.is_migration_context() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.number is not null then
      raise exception 'Une facture est créée en brouillon puis émise via issue_invoice' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status = 'issued' then
      raise exception 'Une facture émise ne peut pas être supprimée (faire un avoir)' using errcode = '42501';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'issued' then
    if coalesce(current_setting('rts.due_date_change', true), '') = 'on' then
      v_mutable := v_mutable || array['due_date'];
    end if;
    if (to_jsonb(new) - v_mutable) is distinct from (to_jsonb(old) - v_mutable) then
      raise exception 'Une facture émise ne peut plus être modifiée (faire un avoir)' using errcode = '42501';
    end if;
  elsif new.status = 'issued' or new.number is not null then
    if coalesce(current_setting('rts.issuing', true), '') <> 'on' then
      raise exception 'L''émission d''une facture passe par issue_invoice' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.set_invoice_due_date(p_invoice_id uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  perform public.assert_office();

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Facture introuvable' using errcode = 'P0002';
  end if;
  if p_due_date is null then
    raise exception 'Indique la nouvelle échéance' using errcode = '22023';
  end if;
  if v_invoice.status = 'issued' and p_due_date < (v_invoice.issued_at at time zone 'Europe/Paris')::date then
    raise exception 'L''échéance ne peut pas précéder l''émission de la facture' using errcode = '22023';
  end if;
  if v_invoice.due_date is not distinct from p_due_date then
    return;
  end if;

  perform set_config('rts.due_date_change', 'on', true);
  update public.invoices set due_date = p_due_date where id = p_invoice_id;
  perform set_config('rts.due_date_change', 'off', true);

  if v_invoice.status = 'issued' then
    insert into public.invoice_due_date_changes (invoice_id, old_date, new_date)
    values (p_invoice_id, v_invoice.due_date, p_due_date);
  end if;
end;
$$;
revoke execute on function public.set_invoice_due_date(uuid, date) from public, anon;
grant execute on function public.set_invoice_due_date(uuid, date) to authenticated;
comment on function public.set_invoice_due_date(uuid, date) is
  'Déplace l''échéance d''une facture (bureau), même émise ; le changement est gardé.';
