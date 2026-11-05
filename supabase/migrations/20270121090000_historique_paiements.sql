-- =============================================================================
-- Historique des règlements d'une facture
--
-- Demande du client : garder chaque paiement saisi (avec son montant) et chaque paiement supprimé
-- (avec un motif facultatif). Les triggers écrivent le journal : toute saisie et toute suppression y
-- passent, d'où qu'elles viennent. Personne ne le modifie : lecture seule pour le bureau.
-- =============================================================================

create table public.payment_events (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  -- Sans clé étrangère : la ligne reste quand le paiement est supprimé
  payment_id   uuid not null,
  kind         text not null check (kind in ('recorded', 'deleted')),
  amount_ttc   numeric(12,2) not null,
  method       public.payment_method not null,
  paid_on      date not null,
  note         text,
  reason       text check (char_length(reason) <= 500),
  actor_id     uuid references public.profiles (id) on delete set null,
  happened_at  timestamptz not null default now()
);
create index payment_events_invoice_idx on public.payment_events (invoice_id, happened_at);
comment on table public.payment_events is 'Historique des règlements : paiements saisis et supprimés, en lecture seule.';
comment on column public.payment_events.reason is 'Motif facultatif donné à la suppression.';

alter table public.payment_events enable row level security;
revoke all on public.payment_events from public, anon, authenticated;
grant select on public.payment_events to authenticated;
create policy payment_events_select on public.payment_events for select to authenticated
  using ((select public.is_office()));

-- Paiements déjà enregistrés : repris dans l'historique (ceux supprimés avant ce journal sont perdus)
insert into public.payment_events (invoice_id, payment_id, kind, amount_ttc, method, paid_on, note, actor_id, happened_at)
select invoice_id, id, 'recorded', amount_ttc, method, paid_on, note, recorded_by, created_at
from public.payments;

create or replace function public.payments_log_recorded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (invoice_id, payment_id, kind, amount_ttc, method, paid_on, note, actor_id, happened_at)
  values (new.invoice_id, new.id, 'recorded', new.amount_ttc, new.method, new.paid_on, new.note, new.recorded_by, new.created_at);
  return null;
end;
$$;

create trigger payments_log_recorded
  after insert on public.payments
  for each row execute function public.payments_log_recorded();

create or replace function public.payments_log_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payment_events (invoice_id, payment_id, kind, amount_ttc, method, paid_on, note, reason, actor_id)
  values (old.invoice_id, old.id, 'deleted', old.amount_ttc, old.method, old.paid_on, old.note,
          nullif(current_setting('rts.payment_delete_reason', true), ''), auth.uid());
  return null;
end;
$$;

create trigger payments_log_deleted
  after delete on public.payments
  for each row execute function public.payments_log_deleted();

revoke execute on function public.payments_log_recorded(), public.payments_log_deleted()
from public, anon, authenticated;

-- Suppression avec motif : le droit reste celui de la table (direction, security invoker).
create or replace function public.delete_payment(p_payment_id uuid, p_reason text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('rts.payment_delete_reason', coalesce(btrim(p_reason), ''), true);
  delete from public.payments where id = p_payment_id;
  if not found then
    raise exception 'Paiement non supprimé : déjà supprimé, ou suppression réservée à la direction'
      using errcode = 'P0001';
  end if;
  perform set_config('rts.payment_delete_reason', '', true);
end;
$$;

revoke execute on function public.delete_payment(uuid, text) from public, anon;
grant execute on function public.delete_payment(uuid, text) to authenticated;
