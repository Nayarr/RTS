-- =============================================================================
-- RTS Atelier : Consignes des pièces en échange standard
--   Une pièce montée sur un OR (alternateur, démarreur, étrier, turbo…) peut avoir
--   son ancienne pièce en consigne : le fournisseur a facturé une consigne et la
--   rembourse par un avoir quand l'ancienne pièce lui est renvoyée.
--   Suivi : À renvoyer → Renvoyée → Remboursée (ou Refusée).
--   Le bureau et le mécano de l'OR déclarent la consigne ; seul le bureau suit
--   le renvoi et le remboursement (aussi après la facture de l'OR).
--   Rien n'est refacturé au client.
-- =============================================================================

create type public.part_core_status as enum ('to_return', 'returned', 'refunded', 'refused');

create table public.part_cores (
  id                  uuid primary key default gen_random_uuid(),
  ro_line_id          uuid not null unique references public.ro_lines (id) on delete cascade,
  repair_order_id     uuid not null references public.repair_orders (id) on delete cascade,
  supplier_id         uuid references public.suppliers (id) on delete set null,
  amount_ht           numeric(12,2) check (amount_ht >= 0),            -- consigne facturée par le fournisseur
  status              public.part_core_status not null default 'to_return',
  returned_on         date,
  refunded_on         date,
  refunded_amount_ht  numeric(12,2) check (refunded_amount_ht >= 0),   -- montant de l'avoir reçu
  notes               text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.part_cores is
  'Consignes : ancienne pièce à renvoyer au fournisseur pour le remboursement de la consigne.';
create index part_cores_repair_order_idx on public.part_cores (repair_order_id);
create index part_cores_status_idx on public.part_cores (status);

create trigger set_updated_at before update on public.part_cores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rattachement et dates
-- ---------------------------------------------------------------------------

create function public.part_cores_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.ro_lines;
begin
  if tg_op = 'INSERT' then
    select * into v_line from public.ro_lines where id = new.ro_line_id;
    if v_line.line_type is distinct from 'part' then
      raise exception 'Seule une pièce peut avoir une consigne' using errcode = '22023';
    end if;
    new.repair_order_id := v_line.repair_order_id;
    new.supplier_id := coalesce(new.supplier_id, v_line.supplier_id);
    new.created_by := coalesce(new.created_by, auth.uid());
  elsif new.ro_line_id is distinct from old.ro_line_id or new.repair_order_id is distinct from old.repair_order_id then
    raise exception 'La consigne reste attachée à sa pièce' using errcode = '22023';
  end if;

  -- Dates du jour (heure de Paris) quand le statut avance sans date saisie
  if new.status in ('returned', 'refunded', 'refused') and new.returned_on is null then
    new.returned_on := public.paris_date(now());
  end if;
  if new.status = 'refunded' then
    new.refunded_on := coalesce(new.refunded_on, public.paris_date(now()));
    new.refunded_amount_ht := coalesce(new.refunded_amount_ht, new.amount_ht);
  else
    new.refunded_on := null;
    new.refunded_amount_ht := null;
  end if;
  if new.status = 'to_return' then
    new.returned_on := null;
  end if;
  return new;
end;
$$;
revoke all on function public.part_cores_prepare() from public, anon, authenticated;

create trigger part_cores_prepare
  before insert or update on public.part_cores
  for each row execute function public.part_cores_prepare();

-- ---------------------------------------------------------------------------
-- Historique de l'OR
-- ---------------------------------------------------------------------------

create function public.part_cores_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ro_id uuid := case when tg_op = 'DELETE' then old.repair_order_id else new.repair_order_id end;
  v_part text := (select split_part(l.description, chr(10), 1) from public.ro_lines l
                  where l.id = case when tg_op = 'DELETE' then old.ro_line_id else new.ro_line_id end);
  v_label text;
begin
  -- Pièce supprimée avec sa consigne : la ligne a déjà disparu, rien à écrire
  if v_part is null or not exists (select 1 from public.repair_orders where id = v_ro_id) then
    return null;
  end if;
  v_label := case
    when tg_op = 'INSERT' then 'Consigne : ancienne pièce à renvoyer : '
    when tg_op = 'DELETE' then 'Consigne retirée : '
    when new.status = 'returned' then 'Consigne : ancienne pièce renvoyée : '
    when new.status = 'refunded' then 'Consigne remboursée : '
    when new.status = 'refused' then 'Consigne refusée : '
    else 'Consigne : ancienne pièce à renvoyer : '
  end;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  insert into public.ro_events (repair_order_id, label, actor_id) values (v_ro_id, v_label || v_part, auth.uid());
  return null;
end;
$$;
revoke all on function public.part_cores_log() from public, anon, authenticated;

create trigger part_cores_log
  after insert or update of status or delete on public.part_cores
  for each row execute function public.part_cores_log();

-- ---------------------------------------------------------------------------
-- Droits : lecture avec l'OR ; le mécano de l'OR ouvert déclare ou retire une
-- consigne encore à renvoyer ; le bureau fait tout.
-- ---------------------------------------------------------------------------

alter table public.part_cores enable row level security;

create policy part_cores_select on public.part_cores for select to authenticated
  using (public.can_read_repair_order(repair_order_id));
create policy part_cores_insert on public.part_cores for insert to authenticated
  with check (public.is_office()
              or (public.can_tech_edit_repair_order(repair_order_id) and status = 'to_return'));
create policy part_cores_update on public.part_cores for update to authenticated
  using (public.is_office()) with check (public.is_office());
create policy part_cores_delete on public.part_cores for delete to authenticated
  using (public.is_office()
         or (public.can_tech_edit_repair_order(repair_order_id) and status = 'to_return'));

revoke all on public.part_cores from public, anon;
grant select, insert, update, delete on public.part_cores to authenticated;

-- ---------------------------------------------------------------------------
-- Liste du bureau : pièce, fournisseur, OR et véhicule lisibles.
-- ---------------------------------------------------------------------------

create view public.v_part_cores
with (security_invoker = on) as
select
  pc.*,
  split_part(l.description, chr(10), 1) as part_name,
  l.brand,
  coalesce(l.manufacturer_ref, l.oem_ref) as reference,
  l.quantity,
  s.name as supplier_name,
  ro.number as repair_order_number,
  ro.vehicle_id,
  v.plate as vehicle_plate
from public.part_cores pc
join public.ro_lines l on l.id = pc.ro_line_id
join public.repair_orders ro on ro.id = pc.repair_order_id
left join public.suppliers s on s.id = pc.supplier_id
left join public.vehicles v on v.id = ro.vehicle_id;

revoke all on public.v_part_cores from public, anon;
grant select on public.v_part_cores to authenticated;
